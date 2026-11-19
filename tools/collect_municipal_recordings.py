"""Collect dated activity from the public municipal meeting-video indexes.

Example: python tools/collect_municipal_recordings.py --since 2026-01-01 --through 2026-11-19 --output /tmp/recordings.json
Only the normal published webcast pages and the public data that those pages display are used.
The output is for review with import_activity.py. A changed source format raises an error.
"""
import argparse
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import date
import json
from pathlib import Path
import re
import time
import unicodedata
from urllib.parse import urlencode
from urllib.request import Request, urlopen

WEBCASTS = {
    "上尾市": "ageo", "上里町": "kamisato", "伊奈町": "inamachi",
    "加須市": "kazo", "吉見町": "yoshimi", "和光市": "wako",
    "坂戸市": "sakado", "宮代町": "miyashiro", "幸手市": "satte",
    "日高市": "hidaka", "朝霞市": "asaka", "杉戸町": "sugito",
    "桶川市": "okegawa", "草加市": "soka",
}
BASE = "https://smart.discussvision.net"
CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳"
TOPIC_NUMBER = re.compile(r"^[0-9０-９]{1,2}[.．、\s]+")
BULLET = re.compile(r"^[・●○〇" + CIRCLED + r"]\s*")
GENERIC = re.compile(r"^(?:開\s*[議会]|散会|一般質問|代表質問|議案質疑|一括質問|一問一答(?:方式)?|議事日程の報告)$")
NAME = re.compile(r"[ぁ-んァ-ヿ一-龯々﨑髙\U00020000-\U0002ffff\U000e0100-\U000e01ef]{2,14}")


def normalized(value):
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value).replace("\u200b", "")).strip()


def download(url):
    for attempt in range(3):
        try:
            request = Request(url, headers={"User-Agent": "Saitama-Council-Records/1.0"})
            with urlopen(request, timeout=35) as response:
                return response.read().decode("utf-8-sig")
        except (OSError, UnicodeError):
            if attempt == 2:
                raise
            time.sleep(1 + attempt)


def headings(place, content):
    raw = re.split(r"\r?\n|<br\s*/?>", content, flags=re.I)
    lines = [re.sub("<[^>]+>", "", line).replace("\u200b", "").strip() for line in raw]
    lines = [line for line in lines if line]
    result = []
    for line in lines:
        number = TOPIC_NUMBER.match(line)
        if number:
            title = normalized(line[number.end():])
            if title:
                result.append(title)
        elif place == "桶川市" and result and not re.match(r"^[（(①-⑳]", line):
            result[-1] += normalized(line)
    if not result:
        result = [normalized(BULLET.sub("", line)) for line in lines if BULLET.match(line)]
    if not result:
        result = [normalized(line) for line in lines if 3 <= len(line) <= 90 and
                  not any(x in line for x in ("代表質問", "一般質問", "議員", "【"))][:1]
    return [title for title in result if 2 <= len(title) <= 180 and not GENERIC.fullmatch(title)
            and not re.search(r"議員$|議事日程|会議録署名|^議長|^委員長報告|市政に対する一般質問", title)]


def event_date(day_label, end_date):
    match = re.search(r"(\d{1,2})月\s*(\d{1,2})日", normalized(day_label))
    if not match:
        return None
    month, day = map(int, match.groups())
    # The webcast can file a December council session under its January closing year.
    year = end_date.year - (month > end_date.month)
    return date(year, month, day)


def collect(place, since, through):
    slug = WEBCASTS[place]
    webroot = f"{BASE}/smart/tenant/{slug}/WebView/"
    setup = download(webroot + "js/tenant.js")
    match = re.search(r'^document.write.*?name="tenant_id" value="(\d+)"', setup, re.M)
    if not match:
        raise ValueError(f"{place}の公開配信ページで自治体識別子を確認できません")
    records, sessions = [], []
    for year in range(since.year, through.year + 1):
        query = urlencode({"year": year, "tenant_id": match[1], "group_desc": "false",
                           "council_desc": "false", "schedule_desc": "false", "council_id": "", "schedule_id": ""})
        councils = json.loads(download(f"{BASE}/dvsapi/councilrd/all?{query}"))
        if not isinstance(councils, list):
            raise ValueError(f"{place}の会期一覧の形式が変わりました")
        for council in councils:
            label = council["label"]
            if "定例" not in label:
                continue
            end = date.fromisoformat(council["year"])
            index_url = webroot + "rd/council.html?" + urlencode({"year": year, "council_id": council["council_id"]})
            distinct = set()
            names = set()
            for schedule in council["schedules"]:
                day = event_date(schedule["label"], end)
                if not day or not since <= day <= through:
                    continue
                speeches = schedule["playlist"]
                announced_general = any(re.search(r"[市町]政に対する一般質問", speech.get("content") or "") for speech in speeches)
                for speech in speeches:
                    name = re.split(r"[（(【]", re.sub(r"\s+", "", speech["speaker"] or ""))[0].removesuffix("議員")
                    if not NAME.fullmatch(name) or str(speech["movie_released"]) != "2":
                        continue
                    if re.search(r"委員会|答弁|事務|議長|市長|町長|教育長", name):
                        continue
                    content = speech["content"] or ""
                    kind = next((k for k in ("一般質問", "代表質問") if k in schedule["label"]), None)
                    if not kind:
                        kind = next((k for k in ("一般質問", "代表質問") if k in normalized(content)[:24]), None)
                    if announced_general and not kind:
                        kind = "一般質問"
                    if place == "加須市" and not announced_general:
                        continue
                    if not kind and place in ("加須市", "朝霞市", "上里町", "和光市", "坂戸市") and "本会議" in schedule["label"]:
                        kind = "本会議発言"
                    if not kind:
                        continue
                    url = webroot + "rd/speech.html?" + urlencode({
                        "council_id": council["council_id"], "schedule_id": schedule["schedule_id"],
                        "playlist_id": speech["playlist_id"], "speaker_id": speech["speaker_id"], "target_year": year,
                    })
                    for title in headings(place, content):
                        if place == "加須市" and re.search(r"につい$|^議案|^議第|第.+号議案|議案第|決算特別|委員長", title):
                            continue
                        ident = (name, day, kind, title)
                        if ident in distinct:
                            continue
                        distinct.add(ident)
                        names.add(name)
                        records.append(dict(place=place, name=name, date=day.isoformat(), kind=kind,
                                            title=title, url=url, sourceTitle=f"{place}議会 {label} 録画配信"))
            if distinct:
                sessions.append(dict(place=place, label=label, url=index_url, count=len(distinct), people=len(names)))
    return records, sessions


def main():
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--since", required=True, type=date.fromisoformat)
    cli.add_argument("--through", required=True, type=date.fromisoformat)
    cli.add_argument("--place", choices=sorted(WEBCASTS), action="append", help="省略時は対応する全議会")
    cli.add_argument("--output", required=True, type=Path)
    args = cli.parse_args()
    if args.through < args.since:
        cli.error("--through must be on or after --since")
    result = {"records": [], "sessions": []}
    places = list(dict.fromkeys(args.place or WEBCASTS))
    with ThreadPoolExecutor(max_workers=3) as pool:
        for rows, sessions in pool.map(lambda p: collect(p, args.since, args.through), places):
            result["records"].extend(rows)
            result["sessions"].extend(sessions)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    temp = args.output.with_name(args.output.name + ".tmp")
    temp.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temp.replace(args.output)
    print(dict(Counter(row["place"] for row in result["records"])))


if __name__ == "__main__":
    main()
