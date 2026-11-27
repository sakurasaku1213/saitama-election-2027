"""Write the reviewed council text bundle as one JSON file per document under data/bodies.

  python tools/export_bodies.py <bundle.json>

The web site fetches data/bodies/<first two characters of the ID>/<ID>.json when a document is opened.
Each file keeps the section order of the bundle, because data elsewhere points into it by 1-based position.
data/question-bodies.js records the count and a digest of the whole set. Files for IDs that are no
longer in data/question-text-2026.js are removed.
"""
import argparse
from pathlib import Path

from question_bodies import BODIES, MANIFEST, compact, digest, load, shard_path


def write_if_changed(path, content):
    if path.is_file() and path.read_text(encoding="utf-8") == content:
        return False
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(content, encoding="utf-8")
    temporary.replace(path)
    return True


def export(bundle):
    corpus = load(bundle)
    written = sum(write_if_changed(shard_path(doc_id), compact(sections) + "\n") for doc_id, sections in corpus.items())
    keep = {shard_path(doc_id) for doc_id in corpus}
    removed = 0
    for path in BODIES.glob("*/*.json"):
        if path not in keep:
            path.unlink()
            removed += 1
    for folder in BODIES.iterdir():
        if folder.is_dir() and not any(folder.iterdir()):
            folder.rmdir()
    manifest = ('GIKAI.questionBodies = '
                + compact({"base": "data/bodies/", "count": len(corpus), "sha256": digest(corpus)}) + ";\n")
    write_if_changed(MANIFEST, manifest)
    return len(corpus), written, removed


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("bundle", type=Path, help="Reviewed bundle {id: [[label, text], ...]}")
    count, written, removed = export(parser.parse_args().bundle)
    print(f"{count} documents, {written} files written, {removed} removed")
