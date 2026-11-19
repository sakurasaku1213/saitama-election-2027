"""Package the live entry point and its adjacent assets as one offline HTML file."""
import argparse
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]

def render():
    document = (ROOT/"index.html").read_text(encoding="utf-8")
    def embed_script(match):
        code = (ROOT/match[1]).read_text(encoding="utf-8")
        # HTML interprets an end tag even inside JavaScript strings.
        code = re.sub(r"</script", lambda _:r"<\/script", code, flags=re.I)
        return "<script>\n"+code+"\n</script>"
    document = re.sub(r'<script\s+src="([^"]+)"\s*></script>',embed_script,document)
    if 'src="data/' in document or 'src="assets/' in document:
        raise ValueError("Unable to embed all scripts")
    document = document.replace("<body>",'<body data-portable>')
    css = (ROOT/"assets/site.css").read_text(encoding="utf-8")
    return document.replace('<link rel="stylesheet" href="assets/site.css">','<style>\n'+css+'\n</style>').replace('<link rel="stylesheet" href="assets/site.css" />','<style>\n'+css+'\n</style>')

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output",type=Path)
    destination=parser.parse_args().output.resolve()
    if destination==ROOT/"index.html":raise SystemExit("Choose a separate export path.")
    destination.parent.mkdir(parents=True,exist_ok=True)
    destination.write_text(render(),encoding="utf-8")
