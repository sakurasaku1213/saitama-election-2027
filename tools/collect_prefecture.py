"""Create a citation index from the Saitama assembly's own public directories.

Requires Python 3.10+ and lxml. HTML preserves the question subheadings, links
and dates that text-only versions sometimes merge. Overview discovery uses
Jina Reader. Run with --through YYYY-MM in a directory of your choice.
"""
import argparse
import datetime
import json
from pathlib import Path
import re
import time
from urllib.parse import urljoin, urlsplit
from urllib.request import urlopen
from lxml import html

BASE = 'https://www.pref.saitama.lg.jp'
ROSTER = BASE + '/e1601/gikai-member-kaiha.html'
DISTRICT_ROSTER = BASE + '/e1601/gikai-member-senkyoku.html'
MD_LINK = re.compile(r'\[([^\]]+)\]\((https?://[^)]+)\)')
QUESTION_NAME = re.compile(r'(.+?)\s*[(（]([^（）()]+)[）)]')
WHEN = re.compile(r'(\d+)月\s*(\d+)日')
QUESTION_MARK = re.compile(r'^(?:(?P<major>[0-9０-９]{1,2})(?![0-9０-９])\s*[.．、]?\s*|[（(]\s*(?P<minor>[0-9０-９]+)\s*[)）]\s*|(?P<letter>[アイウエオカキクケコサシスセソタチツテト])\s+)')
RESPONDER = re.compile(r'[（(](?:[^（()）]{0,95}(?:知事|長|管理者|委員|教育監|監))[）)]$')
LINK_TOKEN = re.compile(r'⟦(\d+)⟧')
DAYS_JA = '月火水木金土日'

def clean(s):
    return ' '.join(s.split()).strip()

def fetch(url, path):
    if path.exists():
        return path.read_text(encoding='utf-8')
    for attempt in range(3):
        try:
            with urlopen(url, timeout=40) as response:
                text = response.read().decode('utf-8-sig')
            path.write_text(text, encoding='utf-8')
            return text
        except OSError:
            if attempt == 2:
                raise
            time.sleep(3 * (attempt + 1))

def page(url, key, cache):
    return html.fromstring(fetch(url, cache / (key + '.html'))).get_element_by_id('tmp_contents')

def source_date(block):
    text = block.get_element_by_id('tmp_update').text_content()
    year, month, day = map(int, re.search(r'(\d{4})年(\d+)月(\d+)日', text).groups())
    return datetime.date(year, month, day).isoformat()

def read_roster(cache):
    index = page(DISTRICT_ROSTER, 'roster', cache)
    directory = {}
    for a in index.xpath('.//a[@href]'):
        label = clean(a.text_content())
        if re.match(r'^[南北東西]第\d+区\s*\S', label):
            directory[urljoin(BASE, a.get('href'))] = label
    central = page(ROSTER, 'roster-group', cache)
    groups = {}
    group = None
    for p in central.xpath('./p'):
        text = clean(p.text_content())
        if p.xpath('.//a[@name]') and ('（' in text or text == '無所属'):
            group = text.split('（')[0]
            continue
        for a in p.xpath('.//a[contains(@href, "gikai-member-list")]'):
            # A single anchor can contain two names separated by a line break.
            for name in a.itertext():
                name = clean(name)
                if not name:
                    continue
                url = urljoin(BASE, a.get('href')).split('#')[0]
                if not group or url not in directory:
                    raise ValueError(('roster grouping', name, url))
                groups[name] = (group, url)
    members = []
    districts = []
    for url, district in directory.items():
        doc = page(url, Path(urlsplit(url).path).stem, cache)
        # Use the district heading, as the page header also gives the prefectural total.
        for heading in doc.xpath('.//h2|.//h3|.//h4'):
            district_seats = re.search(r'定数\s*([0-9０-９]+)', clean(heading.text_content()))
            if district_seats:
                break
        districts.append({'district':district,'url':url,
                          'seats':int(district_seats[1]) if district_seats else None})
        for tr in doc.xpath('.//tr'):
            for cell in tr.xpath('./td'):
                texts = [clean(p.text_content()) for p in cell.xpath('./p')]
                compact = ''.join(''.join(texts).split())
                matched = [n for n, (_, address) in groups.items()
                           if address == url and compact.startswith(n)]
                if len(matched) > 1:
                    raise ValueError(('ambiguous profile', district, matched))
                if not matched:
                    continue
                name = matched[0]
                roles = [clean(li.text_content()) for li in cell.xpath('.//li') if clean(li.text_content())]
                info = {'name':name, 'group':groups[name][0], 'district':district,
                        'url':url, 'roles':roles, 'profileDate':source_date(doc)}
                for a in cell.xpath('.//a[@href]'):
                    label = clean(a.text_content())
                    if '過去の発言' in label:
                        info['speechUrl'] = urljoin(BASE,a.get('href'))
                    elif '録画' in label:
                        info['videoUrl'] = urljoin(BASE,a.get('href'))
                members.append(info)
    missing = set(groups) - {m['name'] for m in members}
    if missing or len(members) != len(groups):
        raise ValueError(('roster profile mismatch', missing))
    return members, districts, source_date(central)

def index_for(code, cache):
    overview = f'{BASE}/e1601/gikai-gaiyou/{code}.html'
    md = fetch('https://r.jina.ai/' + overview, cache / (code + '.md'))
    body = md.split('ここから本文です。')[-1].split('## お問い合わせ')[0]
    matches = [url for label,url in MD_LINK.findall(body) if '一般質問' in label and ('質疑' in label or '答弁' in label)]
    if len(matches) != 1:
        raise ValueError(('question menu',overview,matches))
    return matches[0]

def paragraph_lines(element):
    # Store each link separately while preserving numbers, surrounding text and line breaks.
    links = []
    def inline(el):
        text = el.text or ''
        for child in el:
            if child.tag == 'br':
                text += '\n'
            elif child.tag == 'a' and child.get('href'):
                text += f'⟦{len(links)}⟧'
                links.append((clean(child.text_content()),child.get('href')))
            elif child.tag not in ('script','style'):
                text += inline(child)
            text += child.tail or ''
        return text
    # Source line wrapping usually follows <br>; multiline anchor text stays intact.
    raw = inline(element)
    for line in raw.splitlines():
        ids = [int(x) for x in LINK_TOKEN.findall(line)]
        plain = clean(LINK_TOKEN.sub(lambda m: links[int(m[1])][0], line))
        if plain:
            yield plain, [links[i] for i in ids]

def read_session(code, cache):
    url = index_for(code, cache)
    doc = page(url, code + 'q', cache)
    label = f'令和{int(code[1:3])}年{int(code[3:])}月定例会'
    source_title = '埼玉県議会 ' + label + ' 質疑質問・答弁全文'
    session_year = 2018 + int(code[1:3])
    schedule = {}
    attendees = set()
    question_kind = '一般質問'
    person = None
    current_date = None
    parent = {}
    records = []
    for element in doc:
        tag = element.tag
        plain = clean(element.text_content())
        if tag == 'h2' and ('代表質問' in plain or '一般質問' in plain):
            question_kind = '代表質問' if '代表質問' in plain else '一般質問'
            continue
        if tag == 'h3':
            when = WHEN.search(plain)
            if when:
                month, day = map(int,when.groups())
                d = datetime.date(session_year,month,day)
                if d.strftime('%Y') != str(session_year) or f'{DAYS_JA[d.weekday()]}曜日' not in plain:
                    raise ValueError(('schedule date', plain))
                current_date = d.isoformat()
                continue
            match = QUESTION_NAME.fullmatch(plain)
            if not match:
                raise ValueError(('speaker heading', plain))
            person, group = match.groups()
            person = person.replace(' ','')
            if person not in schedule:
                raise ValueError(('speaker schedule',label,person))
            attendees.add(person)
            parent = {}
            continue
        if tag != 'p':
            continue
        if not person:
            if current_date:
                labels = {}
                for a in element.xpath('.//a[starts-with(@href, "#")]'):
                    anchor = a.get('href')
                    labels[anchor] = labels.get(anchor,'') + a.text_content()
                for anchor,text in labels.items():
                    speaker = QUESTION_NAME.fullmatch(clean(text))
                    if speaker:
                        schedule[speaker[1].replace(' ','')] = (current_date,question_kind,anchor)
            continue
        for line, anchors in paragraph_lines(element):
            included = []
            for raw_title, target in anchors:
                link = urljoin(url, target)
                if '/gikai-gaiyou/' in urlsplit(link).path and link.split('#')[0] != url:
                    included.append((raw_title,link))
            marker = QUESTION_MARK.match(line)
            if marker:
                tier = 0 if marker.lastgroup=='major' else 1 if marker.lastgroup=='minor' else 2
                content = RESPONDER.sub('',line[marker.end():]).strip()
                parent = {t:s for t,s in parent.items() if t<tier}
            elif not included:
                continue
            else:
                tier = 1 if parent else 0
                content = RESPONDER.sub('',line).strip()
            for title,link in included:
                if not title: continue
                probe = QUESTION_MARK.match(title)
                label_text = title[probe.end():] if probe else title
                if len(included) == 1 and marker:
                    label_text = content
                label_text = RESPONDER.sub('',label_text).strip()
                path = [parent[t] for t in sorted(parent) if parent[t] and parent[t] != label_text]
                topic = '／'.join([*path,label_text])
                when,kind,anchor = schedule[person]
                record = {'place':'埼玉県','name':person,'date':when,'kind':kind,
                          'title':topic,'url':link,'sourceTitle':source_title,
                          'groupAtSession':group,'session':code}
                records.append(record)
            if marker and tier<2:
                parent[tier] = content
    if set(schedule) != attendees or not records:
        raise ValueError(('attendance mismatch',label,set(schedule)-attendees))
    # Three index links point at an adjacent item. Their full-text headings and
    # named speakers confirm these replacements; keep unrelated items untouched.
    for rec in records:
        leaf = rec['title'].rsplit('／',1)[-1]
        replacement = {
            ('r0506','伊藤はつみ','都市下水への支援を','h0130.html'):'h0140.html',
            ('r0506','関根信明','新紙幣発行に伴う県の機運盛り上げについて','l013i.html'):'l013a.html',
            ('r0706','金子裕太','市町村の財政的な負担軽減について','0102a.html'):'0102i.html',
        }.get((code,rec['name'],leaf,rec['url'].rsplit('/',1)[-1]))
        if replacement:
            rec['url'] = urljoin(rec['url'],replacement)
    return records, {'label':label,'url':url,'published':source_date(doc),'code':code,
                     'appearances':len(attendees),'count':len(records),
                     'start':min(d for d,_,_ in schedule.values()),'end':max(d for d,_,_ in schedule.values())}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--through', default='2026-09', help='Last completed term in YYYY-MM')
    parser.add_argument('--cache-dir', type=Path, default=Path('raw'))
    parser.add_argument('--output', type=Path, default=Path('pref.json'))
    args = parser.parse_args()
    args.cache_dir.mkdir(parents=True,exist_ok=True)
    end_year,end_month = map(int,args.through.split('-'))
    members, districts, roster_date = read_roster(args.cache_dir)
    records, sessions = [], []
    for year in range(2023,end_year+1):
        for month in (2,6,9,12):
            if (year,month)<(2023,6) or (year,month)>(end_year,end_month):
                continue
            code = f'r{year-2018:02d}{month:02d}'
            data,session = read_session(code,args.cache_dir)
            records.extend(data)
            sessions.append(session)
    if len({r['url'] for r in records}) != len(records):
        raise ValueError('Duplicate question page; compare headings and speaker names in source documents')
    data = {'members':members, 'districts':districts, 'records':records, 'sessions':sessions,
            'rosterURL':ROSTER, 'districtURL':DISTRICT_ROSTER,'rosterDate':roster_date}
    args.output.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n',encoding='utf-8')
    print(f'{len(members)} roster entries, {len(districts)} districts, {len(sessions)} terms, {len(records)} records')

if __name__ == '__main__':
    main()
