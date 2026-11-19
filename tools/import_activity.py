"""Convert a reviewed collection of records and its source register to static data.

Usage: python tools/import_activity.py prefecture reviewed.json
Input records use place, name, date, kind, title, url and sourceTitle.
Regeneration replaces only numbered files for this collection. The HTML loader
is rebuilt from the data directory. Browsing the result needs no web service.
"""
import argparse
from collections import defaultdict
from datetime import date as Date
import json
from pathlib import Path
import re
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"

def encoded(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))

def replace_file(path, content):
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)

def install_files():
    path = ROOT / "index.html"
    html = path.read_text(encoding="utf-8")
    parts = sorted(p.name for p in DATA.glob("*.js") if p.name != "catalog.js")
    tags = "\n".join(f'  <script src="data/{name}"></script>' for name in parts)
    html, changes = re.subn(r'<!-- activity-files -->.*?<!-- end-activity-files -->',
                            '<!-- activity-files -->\n'+tags+'\n  <!-- end-activity-files -->',html,flags=re.S)
    if changes != 1:
        raise ValueError("index.html needs a single data loader section")
    replace_file(path, html)

def import_collection(slug, data):
    if not re.fullmatch(r"[a-z][a-z0-9-]*", slug):
        raise ValueError("Invalid collection name")
    grouped = defaultdict(list)
    seen = set()
    for row in data["records"]:
        key = tuple(row[field] for field in ("place","name","date","kind","title","url","sourceTitle"))
        if any(not isinstance(x,str) or not x.strip() for x in key):
            raise ValueError(f"Missing activity field: {key}")
        place,name,day,kind,title,url,source = key
        if urlsplit(url).scheme not in ("http","https") or not re.fullmatch(r"\d{4}-\d{2}(?:-\d{2})?",day):
            raise ValueError(f"Invalid record: {key}")
        Date.fromisoformat(day if len(day)==10 else day+"-01")
        if key in seen: continue
        seen.add(key)
        group = row.get("groupAtSession") or row.get("groupAtMeeting") or ""
        values = [name,day,kind,title,url,group]
        extra = {f:row[f] for f in ("joint","number","result","resultURL","originalUrl","noticeURL","recordingURL","subject","summaryType") if row.get(f)}
        if extra:
            values.append(extra)
        grouped[(place,source)].append(values)
    if not grouped: raise ValueError("Empty collection")
    # Each part is a complete, reviewable unit. Split long municipal registers
    # into bounded chunks; individual rows are kept on their own line.
    files, fragments, size = {}, [], 0
    def flush():
        nonlocal fragments,size
        if fragments:
            filename=f"activity-{slug}-{len(files)+1:03}.js"
            files[filename]="".join(fragments)
            fragments,size=[],0
    for (place,source),rows in grouped.items():
        for at in range(0,len(rows),160):
            section="GIKAI.activity.push({place:"+encoded(place)+",sourceTitle:"+encoded(source)+",rows:[\n"
            section+=",\n".join(encoded(r) for r in rows[at:at+160])+"\n]});\n"
            length=len(section.encode("utf-8"))
            if size+length>125000: flush()
            fragments.append(section);size+=length
    flush()
    if "sessions" in data:
        session_data=[]
        for s in data["sessions"]:
            item=dict(s)
            item.setdefault("place","埼玉県")
            if not item.get("url") or not item.get("label"):raise ValueError("Missing source register fields")
            session_data.append(item)
        files[f"sources-{slug}.js"]="GIKAI.sessions.push(...[\n"+",\n".join(encoded(s) for s in session_data)+"\n]);\n"
    for filename,contents in files.items():replace_file(DATA/filename,contents)
    for old in DATA.glob(f"activity-{slug}-[0-9][0-9][0-9].js"):
        if old.name not in files:old.unlink()
    install_files()
    return len(seen)

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("collection")
    parser.add_argument("source",type=Path)
    args=parser.parse_args()
    print(import_collection(args.collection,json.loads(args.source.read_text(encoding="utf-8"))))
