"""Collect reviewable question records for Saitama and Kumagaya from public council indexes.

python tools/collect_city_questions.py --since 2023-05-01 --through 2026-11-19 --output /tmp/city-questions.json

Requires lxml and PyMuPDF. Supply a new output path; this collector does not change the live data.
Each Kumagaya speaker is cross-checked with the city's published newsletter. Source title,
meeting dates and links are included in the JSON used by import_activity.py.
"""
import argparse
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import hashlib
import json
from pathlib import Path
import re
import time
import unicodedata
from urllib.parse import urljoin
from urllib.request import Request, urlopen

import fitz
from lxml import html

PLACES = {
    '熊谷市': 'https://kumagaya-city.stream.jfit.co.jp/',
    'さいたま市': 'https://saitama-city.stream.jfit.co.jp/',
}
NEWS = 'https://www.city.kumagaya.lg.jp/shigikai/gikaidayori/index.html'


def normal(text):
    return unicodedata.normalize('NFKC', text)


def compact(text):
    return re.sub(r'\s+', '', normal(text))


class Pages:
    def __init__(self, cache):
        self.cache = cache
        if cache:
            cache.mkdir(parents=True, exist_ok=True)

    def read(self, url):
        path = self.cache / hashlib.sha256(url.encode()).hexdigest() if self.cache else None
        if path and path.exists():
            return path.read_bytes()
        for attempt in range(3):
            try:
                request = Request(url, headers={'User-Agent': 'CivicRecordIndex/1.0'})
                with urlopen(request, timeout=30) as response:
                    body = response.read()
                break
            except OSError:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
        if path:
            path.write_bytes(body)
        return body

    def html(self, url):
        return html.fromstring(self.read(url), parser=html.HTMLParser(encoding='utf-8'))


def links(node, base):
    for a in node.xpath('//a[@href]'):
        yield a.text_content().strip(), urljoin(base, a.get('href'))


def newsletter_index(pages):
    found = {}
    for label, url in links(pages.html(NEWS), NEWS):
        m = re.search(r'\((?:第)?(\d+)号\)\s*令和(\d+)年(\d+)月定例会', normal(label))
        if m:
            number, year, month = map(int, m.groups())
            found[year + 2018, month] = (number, url)
    return found


def read_newsletter(pages, issue):
    number, page_url = issue
    urls = {url for text, url in links(pages.html(page_url), page_url)
            if ('全ページ' in text or '一括' in text) and url.lower().endswith('.pdf')}
    if len(urls) != 1:
        raise ValueError(f'市議会だより第{number}号の一括 PDF を特定できません')
    pdf_url = urls.pop()
    with fitz.open(stream=pages.read(pdf_url), filetype='pdf') as pdf:
        indexes = [(i + 1, compact(p.get_text())) for i, p in enumerate(pdf) if p.get_text().count('通告順') >= 9]
    if len(indexes) != 1:
        raise ValueError(f'市議会だより第{number}号の一般質問一覧の形式が変わりました')
    page, text = indexes[0]
    # The verbatim March 2024 list omits the word 議員 after 林幸子.
    people = set(re.findall(r'通告順\d+番([^\d!()]{2,8}?)議員', text))
    if '通告順5番林幸子通告順' in text:
        people.add('林幸子')
    return {'number': number, 'page': page, 'pdf': pdf_url, 'people': people, 'index': page_url}


def headings(lines):
    result = []
    numbers = []
    for pos, line in enumerate(lines):
        match = re.match(r'^([０-９0-9]{1,2})[．.。・\s、]+(.+)$', line)
        if match:
            n, title = int(match[1]), match[2].strip()
        elif line == '９子どもの居場所について':
            n, title = 9, '子どもの居場所について'
        else:
            continue
        if pos + 1 < len(lines) and lines[pos + 1].startswith(('－', '―', '−')):
            title += ' ' + lines[pos + 1]
        numbers.append(n)
        result.append(title)
    if not result or numbers != list(range(1, len(result) + 1)):
        raise ValueError('質問大項目の番号を照合できません ' + repr(lines))
    return result


def question_days(pages, place, year, session_url):
    doc = pages.html(session_url)
    for a in doc.xpath('//a[contains(@href,"gikai_result")]'):
        label = compact(a.text_content())
        kind = next((k for k in ('代表質問', '一般質問') if k in label), None)
        if not kind:
            continue
        if place == 'さいたま市':
            date_text = ''.join(a.xpath('parent::dd/preceding-sibling::dt[1]//text()'))
        else:
            date_text = ''.join(a.xpath('ancestor::tr[1]/th//text()'))
        date_match = re.search(r'(\d+)月(\d+)日', compact(date_text))
        if not date_match:
            raise ValueError(f'会議日が見つかりません {session_url} {label}')
        day = date(year, int(date_match[1]), int(date_match[2]))
        yield kind, day, urljoin(session_url, a.get('href'))


def appearances(pages, place, url):
    page = pages.html(url)
    if place == 'さいたま市':
        groups = page.xpath('//ul[contains(@class,"vod-result__col")]')
    else:
        groups = page.xpath('//tr[td[contains(@class,"vodgikai_item_text")]]')
    count = 0
    for group in groups:
        if place == 'さいたま市':
            who = group.xpath('.//span[contains(@class,"item--name")]/text()[1]')
            topic = group.xpath('.//li[contains(@class,"item--text")]')
        else:
            who = group.xpath('.//td[contains(@class,"item_name")]//li[last()]/text()')
            topic = group.xpath('.//td[contains(@class,"item_text")]')
        name = compact(''.join(who))
        if not name.endswith('議員') or not topic:
            continue
        count += 1
        lines = [t.strip() for t in topic[0].itertext() if t.strip()]
        play = group.xpath('.//a[contains(@href,"play_vod")]/@href')[0]
        yield name.removesuffix('議員'), headings(lines), urljoin(url, play)
    if not count:
        raise ValueError(f'質問者を特定できません {url}')


def gather(pages, place, since, through, issues):
    root = PLACES[place]
    entries, sessions = [], []
    urls = list(dict.fromkeys(links(pages.html(root + '?tpl=gikai_list'), root)))
    for label, url in urls:
        if 'gikai_days_list' not in url or not label.endswith('定例会') or '委員会' in label:
            continue
        match = re.match(r'令和(\d+)年', compact(label))
        if not match or not since.year <= int(match[1]) + 2018 <= through.year:
            continue
        label = normal(label)
        days = list(question_days(pages, place, int(match[1]) + 2018, url))
        if not days or any(not since <= d <= through for _, d, _ in days):
            continue
        source_url = url
        news = None
        if place == '熊谷市':
            first = days[0][1]
            issue = issues.get((first.year, first.month))
            if not issue:
                print(f'{label}の議会だよりは公開目次への掲載後に取得できます')
                continue
            news = read_newsletter(pages, issue)
            source_url = news['index']
        records_start = len(entries)
        names = set()
        for kind, day, agenda in days:
            for person, titles, recording in appearances(pages, place, agenda):
                names.add(person)
                evidence = recording
                source = f'{place}議会 議会中継・{label}（録画目次）'
                if news:
                    evidence = f"{news['pdf']}#page={news['page']}"
                    source = f"くまがや市議会だより第{news['number']}号（一般質問一覧・{news['page']}頁）"
                entries.extend(dict(place=place, name=person, date=day.isoformat(), kind=kind,
                                    title=title, url=evidence, sourceTitle=source) for title in titles)
        if news and names != news['people']:
            raise ValueError(f"{label}の質問者に資料間の差があります {names ^ news['people']}")
        sessions.append(dict(place=place, label=label, url=source_url, count=len(entries) - records_start,
                             speakers=len(names), **{'from': days[0][1].isoformat(), 'to': days[-1][1].isoformat()}))
    return entries, sessions


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--since', type=date.fromisoformat, default=date(2023, 5, 1))
    parser.add_argument('--through', type=date.fromisoformat, default=date.today())
    parser.add_argument('--cache', type=Path, help='Use an empty cache for a new research date')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if args.since > args.through:
        parser.error('since must precede through')
    pages = Pages(args.cache)
    issues = newsletter_index(pages)
    with ThreadPoolExecutor(max_workers=2) as ex:
        results = list(ex.map(lambda p: gather(pages, p, args.since, args.through, issues), PLACES))
    records = [row for batch, _ in results for row in batch]
    sessions = [s for _, batch in results for s in batch]
    if not records:
        raise SystemExit('対象期間に収録可能な会期がありません')
    temporary = args.output.with_name(args.output.name + '.tmp')
    temporary.write_text(json.dumps(dict(records=records, sessions=sessions), ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(args.output)
    print(f'{len(sessions)}会期・{len(records)}項目を出力しました。')


if __name__ == '__main__':
    main()
