"""Read and validate council text bodies, from a reviewed bundle or the per-document files in data/bodies."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BODIES = ROOT / "data" / "bodies"
MANIFEST = ROOT / "data" / "question-bodies.js"
INDEX_PREFIX = "GIKAI.questionText = "


def index_ids():
    """Document IDs in the order of data/question-text-2026.js."""
    source = (ROOT / "data" / "question-text-2026.js").read_text(encoding="utf-8")
    if not source.startswith(INDEX_PREFIX):
        raise ValueError("Unable to read the question-text index")
    index, _ = json.JSONDecoder().raw_decode(source[len(INDEX_PREFIX):])
    return [entry["id"] for entry in index["documents"]]


def shard_path_in(directory, doc_id):
    return Path(directory) / doc_id[:2] / (doc_id + ".json")


def shard_path(doc_id):
    return shard_path_in(BODIES, doc_id)


def valid_sections(sections):
    return isinstance(sections, list) and all(
        isinstance(section, list) and len(section) == 2 and all(isinstance(part, str) for part in section)
        for section in sections
    )


def load(source):
    """Return {id: [[label, text], ...]} in index order from a bundle file or a data/bodies directory."""
    source = Path(source)
    ids = index_ids()
    if source.is_dir():
        files = {p.stem for p in source.glob("*/*.json")}
        corpus = {doc_id: json.loads(shard_path_in(source, doc_id).read_text(encoding="utf-8"))
                  for doc_id in ids if doc_id in files}
        extra = files - set(ids)
    else:
        corpus = json.loads(source.read_text(encoding="utf-8"))
        if not isinstance(corpus, dict):
            raise ValueError("Expected question bodies keyed by document ID")
        extra = corpus.keys() - set(ids)
    if not all(isinstance(key, str) and valid_sections(sections) for key, sections in corpus.items()):
        raise ValueError("Invalid question body section")
    missing = set(ids) - corpus.keys()
    if missing or extra:
        raise ValueError(f"Question-text index and body data differ: {len(missing)} missing, {len(extra)} extra")
    return {doc_id: corpus[doc_id] for doc_id in ids}


def compact(value):
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def digest(corpus):
    return hashlib.sha256(compact(corpus).encode("utf-8")).hexdigest()
