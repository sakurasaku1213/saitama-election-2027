"""Package the live site into one HTML file, optionally with the council text bodies embedded.

The bodies can come from a reviewed bundle file or from the per-document files in data/bodies.
"""
import argparse
from pathlib import Path
import re

from question_bodies import compact, load

ROOT = Path(__file__).resolve().parents[1]


def render(question_bodies=None):
    document = (ROOT / "index.html").read_text(encoding="utf-8")
    if question_bodies is not None:
        payload = compact(load(question_bodies))
        payload = payload.replace("<", r"\u003c")
        before_app = '<script src="assets/app.js"></script>'
        if document.count(before_app) != 1:
            raise ValueError("Unable to locate the app script")
        archive = '<script type="application/json" id="question-text-bodies">' + payload + '</script>'
        document = document.replace(before_app, archive + "\n" + before_app)

    def embed_script(match):
        code = (ROOT / match[1]).read_text(encoding="utf-8")
        # HTML interprets an end tag even inside JavaScript strings.
        code = re.sub(r"</script", lambda _: r"<\/script", code, flags=re.I)
        return "<script>\n" + code + "\n</script>"

    document = re.sub(r'<script\s+src="([^"]+)"\s*></script>', embed_script, document)
    if 'src="data/' in document or 'src="assets/' in document:
        raise ValueError("Unable to embed all scripts")
    document = document.replace("<body>", '<body data-portable>')
    css = (ROOT / "assets/site.css").read_text(encoding="utf-8")
    style = "<style>\n" + css + "\n</style>"
    return document.replace('<link rel="stylesheet" href="assets/site.css">', style).replace(
        '<link rel="stylesheet" href="assets/site.css" />', style
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("output", type=Path)
    parser.add_argument("--question-bodies", type=Path,
                        help="Embed the council texts: a reviewed bundle file or the data/bodies directory")
    args = parser.parse_args()
    destination = args.output.resolve()
    if destination == ROOT / "index.html":
        raise SystemExit("Choose a separate export path.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(render(args.question_bodies), encoding="utf-8")
