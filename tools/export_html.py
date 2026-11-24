"""Package the live site and, optionally, a local transcript bundle."""
import argparse
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def render(question_bodies=None):
    document = (ROOT / "index.html").read_text(encoding="utf-8")
    if question_bodies is not None:
        corpus = json.loads(question_bodies.read_text(encoding="utf-8"))
        if not isinstance(corpus, dict):
            raise ValueError("Expected question bodies keyed by document ID")
        if not all(
            isinstance(key, str)
            and isinstance(sections, list)
            and all(isinstance(section, list) and len(section) == 2
                    and all(isinstance(part, str) for part in section)
                    for section in sections)
            for key, sections in corpus.items()
        ):
            raise ValueError("Invalid question body section")
        prefix = "GIKAI.questionText = "
        index_source = (ROOT / "data" / "question-text-2026.js").read_text(encoding="utf-8")
        if not index_source.startswith(prefix):
            raise ValueError("Unable to read the question-text index")
        index, _ = json.JSONDecoder().raw_decode(index_source[len(prefix):])
        keys = {entry["id"] for entry in index["documents"]}
        missing = keys - corpus.keys()
        extra = corpus.keys() - keys
        if missing or extra:
            raise ValueError(
                f"Question-text index and body data differ: {len(missing)} missing, {len(extra)} extra"
            )
        payload = json.dumps(corpus, ensure_ascii=False, separators=(",", ":"))
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
    parser.add_argument("--question-bodies", type=Path, help="Include the locally staged council texts")
    args = parser.parse_args()
    destination = args.output.resolve()
    if destination == ROOT / "index.html":
        raise SystemExit("Choose a separate export path.")
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(render(args.question_bodies), encoding="utf-8")
