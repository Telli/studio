"""Who made each feature of a part, you or the agent, as Studio records it from the time it began
keeping track of the project.

A feature is told by the first line of its statement, stripped (the tracer's ``text``):

- yours when a hand edit wrote that line: the edit service notes the lines each change made by hand
  writes (``note_hand_edit``, ``written``);
- else the agent's when a checkpoint made since recording began has that line in that file: Studio
  (a T3 Code fork) ends every chat turn with one, a commit kept under ``versions.CHECKPOINTS``;
- else nobody's. A line the project had when recording began (its baseline) has no mark, and
  neither has a line no checkpoint holds yet (the agent's turn still running): no mark rather than
  a wrong one.

An edit made outside Studio between two turns is counted with the next turn, as T3 Code's own turn
diff counts it: that turn's checkpoint is the first record of the line. Known, and accepted.

The record is ``LEDGER`` in the project, one JSON object a line, only ever added to: first when
recording began with every project script's lines then (``start``), then one for each hand edit. It
lies beside ``versions.py``'s own scratch in ``.studio``, which git is told to leave out, so no
checkpoint takes it. Nothing is recorded outside a git repository.

Who made a feature is a nicety: git missing, a git command failing or a record cut short leaves the
features with no marks, never a part that cannot be read.
"""

from __future__ import annotations

import json
import os
import re
from datetime import datetime, timezone
from pathlib import Path

from cadgen.edit import versions

__all__ = ["LEDGER", "feature_authors", "note_hand_edit", "start", "written"]

LEDGER = ".studio/authors.jsonl"
# Folders the baseline leaves out besides dot folders: what builds and runs write.
_LEFT_OUT = frozenset({"tmp", "build", "dist"})
# A project whose scripts together are bigger than this (a virtual environment kept in it, say) is
# not recorded: its record would be too big to read again each time a turn ends.
BASELINE_LIMIT = 16 * 1024 * 1024
# Checkpoint copies of files kept read; past this many they are read again as asked.
_BLOBS_KEPT = 4096
# A part's body held in a name to go on from, as a command or Appearance holds a body the part
# returned outright: `return Box(...)` becomes `part = Box(...)`, which is still the line it was.
_HELD = re.compile(r"[A-Za-z_]\w*\s*=\s*(?P<value>.+)")

# Each file's lines as last judged, by (project, file): the moment they were (the newest checkpoint
# and the record's size), and its lines from before recording began, yours and those checkpoints hold.
_JUDGED: dict[tuple[str, str], tuple[tuple, tuple[frozenset, frozenset, frozenset]]] = {}
# Each checkpoint copy of a file read, by (project, blob): its lines, stripped.
_BLOBS: dict[tuple[str, str], frozenset] = {}
# Each project's checkpoints as last listed, by its folder: the stamp of git's ref files they were
# listed at (``_refs_stamp``), and the checkpoints; and the git folder that holds its refs.
_TURNS: dict[str, tuple[tuple, list[dict]]] = {}
_COMMON: dict[str, Path] = {}


def _lines(lines) -> list[str]:
    """Lines stripped, blank ones left out, each once, in order."""
    return list(dict.fromkeys(stripped for line in lines if (stripped := str(line).strip())))


def _forms(line: str) -> tuple[str, ...]:
    """A line, and the line it was when it holds in a name what a line returned outright (``_HELD``)."""
    held = _HELD.fullmatch(line)
    return (line, f"return {held['value']}") if held else (line,)


def _file(rel) -> str | None:
    """A file's path in the project as the record keeps it, or None for one outside the project."""
    text = str(rel or "")
    path = Path(text)
    return None if not text or path.is_absolute() or ".." in path.parts else path.as_posix()


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _git_folder(root: Path) -> Path | None:
    """The project's folder, when it is the top of a git repository (it holds ``.git``); else None."""
    root = Path(root).resolve()
    if not (root / ".git").exists():
        return None
    try:
        top = versions._repository(root)
    except (versions.VersionsError, OSError):
        return None
    return root if top == root else None


def _baseline(root: Path) -> dict[str, list[str]] | None:
    """Each project script's lines as recording begins, by its path in the project: every ``.py``
    outside dot folders, tmp, build and dist. None when they are too big together to record."""
    found: dict[str, list[str]] = {}
    total = 0
    for folder, folders, files in os.walk(root):
        folders[:] = sorted(name for name in folders if not name.startswith(".") and name not in _LEFT_OUT)
        for name in sorted(name for name in files if name.endswith(".py")):
            path = Path(folder) / name
            try:
                data = path.read_bytes()
            except OSError:
                continue
            total += len(data)
            if total > BASELINE_LIMIT:
                return None
            try:
                found[path.relative_to(root).as_posix()] = _lines(data.decode("utf-8").splitlines())
            except UnicodeDecodeError:
                continue
    return found


def start(root: Path) -> None:
    """Begin recording who makes each feature of the project at ``root``: the record's first line,
    the time and each project script's lines (``_baseline``). Once only, and only at the top of a
    git repository; anything in the way leaves the project unrecorded."""
    ledger = Path(root) / LEDGER
    partial = ledger.with_name(f".{ledger.name}.{os.getpid()}")
    try:
        if ledger.exists():
            return
        top = _git_folder(root)
        if top is None:
            return
        # Git is told to leave `.studio` out before anything is written there.
        versions._leave_out_of_git(top)
        began = _now()
        baseline = _baseline(top)
        if baseline is None:
            return
        ledger.parent.mkdir(parents=True, exist_ok=True)
        partial.write_text(json.dumps({"start": began, "baseline": baseline}) + "\n", encoding="utf-8")
        # Another viewer's tracer may have begun first: its record stands.
        if not ledger.exists():
            os.replace(partial, ledger)
    except (OSError, versions.VersionsError):
        pass
    finally:
        try:
            partial.unlink(missing_ok=True)
        except OSError:
            pass


def written(hunks) -> list[str]:
    """The lines a change's hunks (``commands.hunks``: each run of ``old`` lines that becomes
    ``new``) write as the engineer's own: every new line but one the hunk only keeps or moves
    (among the lines it replaces) and the part's body held in a name to go on from (``_HELD``)."""
    out: list[str] = []
    for hunk in hunks if isinstance(hunks, list) else []:
        if not isinstance(hunk, dict) or not isinstance(hunk.get("new"), list):
            continue
        replaced = set(_lines(hunk.get("old") if isinstance(hunk.get("old"), list) else []))
        out += [line for line in _lines(hunk["new"]) if replaced.isdisjoint(_forms(line))]
    return out


def note_hand_edit(root: Path, rel: str, added: list[str]) -> None:
    """Record ``added``, lines a hand edit wrote in ``rel`` (a file's path in the project), as yours:
    one record added to the ledger, its lines stripped and blank ones left out. Nothing where
    recording has not begun: before the part's first trace, or outside a git repository."""
    file, lines = _file(rel), _lines(added)
    if file is None or not lines:
        return
    record = json.dumps({"at": _now(), "by": "you", "file": file, "lines": lines}) + "\n"
    try:
        # Added to a record that is there, never one made here.
        handle = os.open(Path(root) / LEDGER, os.O_WRONLY | os.O_APPEND | getattr(os, "O_BINARY", 0))
    except OSError:
        return
    try:
        os.write(handle, record.encode("utf-8"))
    except OSError:
        pass
    finally:
        os.close(handle)


def _read(ledger: Path) -> tuple[float, dict, dict] | None:
    """The record: when it began (in seconds), each file's lines then, and the lines hand edits
    wrote in each. None when its first line is not a beginning."""
    began, before, yours = None, {}, {}
    with ledger.open(encoding="utf-8") as text:
        for number, line in enumerate(text):
            try:
                record = json.loads(line)
            except ValueError:
                record = None  # one being written, or cut short
            if number == 0:
                if not isinstance(record, dict) or not isinstance(record.get("start"), str) or not isinstance(record.get("baseline"), dict):
                    return None
                began = datetime.fromisoformat(record["start"]).timestamp()
                before = {file: frozenset(lines) for file, lines in record["baseline"].items() if isinstance(lines, list)}
            elif isinstance(record, dict) and record.get("by") == "you" and isinstance(record.get("file"), str) \
                    and isinstance(record.get("lines"), list):
                yours.setdefault(record["file"], set()).update(each for each in record["lines"] if isinstance(each, str))
    return (began, before, yours) if began is not None else None


def _blob_lines(root: Path, blobs: list[str]) -> list[frozenset]:
    """Each blob's lines, stripped: read from git once, those not read yet in one ``cat-file``."""
    if len(_BLOBS) > _BLOBS_KEPT:
        _BLOBS.clear()
    unread = [blob for blob in blobs if (str(root), blob) not in _BLOBS]
    if unread:
        out = versions._git(root, "cat-file", "--batch", stdin=("\n".join(unread) + "\n").encode("utf-8"))
        at = 0
        for blob in unread:
            end = out.index(b"\n", at)
            _name, kind, *size = out[at:end].decode("utf-8").split()
            at = end + 1
            if kind != "blob" or not size:
                continue  # "missing"
            data = out[at : at + int(size[0])]
            at += int(size[0]) + 1
            _BLOBS[(str(root), blob)] = frozenset(_lines(data.decode("utf-8", "replace").splitlines()))
    return [_BLOBS.get((str(root), blob), frozenset()) for blob in blobs]


def _judge(root: Path, file: str, turns: list[dict], record: tuple) -> tuple[frozenset, frozenset, frozenset]:
    """``file``'s lines from before recording began, those hand edits wrote, and those the
    checkpoints made since hold: each checkpoint's copy of the file read once."""
    began, before, yours = record
    since = [turn for turn in turns if turn["time"] >= int(began)]
    blobs = sorted({blob for blob in versions._blobs(root, [f"{turn['commit']}:{file}" for turn in since]) if blob})
    held = frozenset().union(*_blob_lines(root, blobs)) if blobs else frozenset()
    return before.get(file, frozenset()), frozenset(yours.get(file, ())), held


def _refs_stamp(root: Path) -> tuple:
    """git's files of the checkpoints' refs as they are now, read without running git (but once, to
    find them): the stamp changes whenever a checkpoint is made, moved or taken away, loose,
    packed or in a reftable, so a part read while nothing moved lists no checkpoints again."""
    common = _COMMON.get(str(root))
    if common is None:
        common = _COMMON[str(root)] = (root / versions._git(root, "rev-parse", "--git-common-dir").decode("utf-8").strip()).resolve()
    paths = [common / "packed-refs", common / "reftable" / "tables.list"]
    for folder, _folders, files in os.walk(common / versions.CHECKPOINTS):
        paths += [Path(folder), *(Path(folder) / name for name in sorted(files))]
    stamp = []
    for path in paths:
        try:
            found = path.stat()
            stamp.append((path.as_posix(), found.st_mtime_ns, found.st_size))
        except FileNotFoundError:
            # Not there, or gone since the walk found it (a ref's lock, renamed into the ref).
            stamp.append((path.as_posix(), None, None))
    return tuple(stamp)


def _turns(root: Path) -> list[dict]:
    """The project's checkpoints, oldest first (``versions._checkpoints``), listed again only when
    their refs moved since."""
    stamp = _refs_stamp(root)
    listed = _TURNS.get(str(root))
    if listed is None or listed[0] != stamp:
        listed = _TURNS[str(root)] = (stamp, [row for row in versions._checkpoints(root) if row["ref"].startswith(versions.CHECKPOINTS)])
    return listed[1]


def _authors(root: Path, features: list[dict]) -> dict[str, str]:
    ledger = root / LEDGER
    try:
        size = ledger.stat().st_size
    except OSError:
        return {}
    turns = _turns(root)
    moment = (turns[-1]["commit"] if turns else None, size)
    record = None
    made: dict[str, str] = {}
    for feature in features:
        file, text = _file(feature.get("file")), str(feature.get("text") or "").strip()
        # A suppressed feature's line is Studio's note of what it was (`deleting.py`), not a statement.
        if file is None or not text or not feature.get("key") or feature.get("suppressed"):
            continue
        judged = _JUDGED.get((str(root), file))
        if judged is None or judged[0] != moment:
            if record is None:
                record = _read(ledger)
                if record is None:
                    return {}
            judged = (moment, _judge(root, file, turns, record))
            _JUDGED[(str(root), file)] = judged
        before, yours, held = judged[1]
        forms = _forms(text)
        if not before.isdisjoint(forms):
            continue
        if not yours.isdisjoint(forms):
            made[feature["key"]] = "you"
        elif not held.isdisjoint(forms):
            made[feature["key"]] = "agent"
    return made


def feature_authors(root: Path, features: list[dict]) -> dict[str, str]:
    """Who made each of ``features`` (the tracer's: its ``key``, ``file``, and ``text``, the first
    line of its statement stripped), by its key: "you" or "agent", and no entry for one nobody is
    known to have made (the module's words). Each file is judged once for each moment of the
    project: its newest checkpoint and the record's size."""
    try:
        return _authors(Path(root).resolve(), features)
    except Exception:  # noqa: BLE001 - a nicety (the module's words): the part is read with no marks
        return {}
