"""cadgen 0.7's ref grammar: ``[FILE]#SELECTOR(,SELECTOR)*``, an occurrence by its tree position
(``o1.2``), an element by its kind and ordinal (``f17``, ``e3``, ``v1``, ``s1``), or a part by its label
(``bracket.f3``).

Studio keeps the part of cadgen 0.7's ``cad_ref_syntax`` (2f793659fb) it still reads, trimmed to that:
0.8 removed the module, and its refs, with the old pipeline. The scene adapter (``step_open``) reads
these refs in study and job files already in projects, beside the engine's own grammar
(``cadgen.engine.refs``), and KiCad board refs (``cadgen.kicad.refs``) take their file half the same
way. Standard library only.
"""

from __future__ import annotations

import json
import os
import re
from dataclasses import dataclass

__all__ = ["QUOTED_PREFIX_RE", "ParsedSelector", "parse_selector", "parse_selector_list", "path_has_suffix",
           "ref_prefix_names", "split_cad_ref"]

# The file half lives LEFT of the '#': the selector grammar owns everything to the right. A path with a
# space, a quote, a '#' or a backslash is JSON-quoted.
QUOTED_PATH_PATTERN = r'"(?:[^"\\\r\n]|\\.)*"'
QUOTED_PREFIX_RE = re.compile(rf"^({QUOTED_PATH_PATTERN})#")
OCCURRENCE_SELECTOR_RE = re.compile(r"^o((?:\d+)(?:\.\d+)*)$")
OCCURRENCE_ENTITY_SELECTOR_RE = re.compile(r"^o((?:\d+)(?:\.\d+)*)\.([sfev])(\d+)$")
ENTITY_SELECTOR_RE = re.compile(r"^([sfev])(\d+)$")

# A build123d part label used in place of an occurrence id: it does not start with a digit and holds no
# "." (the entity separator).
LABEL_PATTERN = r"[A-Za-z_][A-Za-z0-9_:]*"
LABEL_SELECTOR_RE = re.compile(rf"^({LABEL_PATTERN})$")
LABEL_ENTITY_SELECTOR_RE = re.compile(rf"^({LABEL_PATTERN})\.([sfev])(\d+)$")
# Mates are not part of the grammar, and "m1" would otherwise read as a label.
MATE_SELECTOR_RE = re.compile(r"^m\d+$", re.IGNORECASE)

_KINDS = {"s": "shape", "f": "face", "e": "edge", "v": "vertex"}


@dataclass(frozen=True)
class ParsedSelector:
    """One selector: its type (``occurrence``, ``shape``, ``face``, ``edge``, ``vertex``, ``label`` or
    ``opaque``), its occurrence id (``o1.2``, empty when it names none), its ordinal, and its canonical
    text. ``label`` is set when a part was named by its label rather than by its position."""

    selector_type: str
    occurrence_id: str
    ordinal: int | None
    canonical: str
    label: str = ""


def _path_segments(path: str) -> list[str]:
    return [part for part in str(path or "").replace("\\", "/").split("/") if part]


def path_has_suffix(path: str, suffix: str) -> bool:
    """Whether ``suffix`` names ``path``, segment by segment: ``plate.stl`` names ``a/b/plate.stl``;
    ``late.stl`` names nothing."""
    path_segments = _path_segments(path)
    suffix_segments = _path_segments(suffix)
    if not suffix_segments or len(suffix_segments) > len(path_segments):
        return False
    return path_segments[len(path_segments) - len(suffix_segments):] == suffix_segments


def ref_prefix_names(prefix: str, document_path: str) -> bool:
    """Whether a ref's file prefix names ``document_path``, read as a path: ``~`` expands and links
    resolve; an absolute prefix names the document only if it is that file; a relative one names it if
    it names the same file from the working directory, else if it is the end of the document's path."""
    prefix = str(prefix or "").strip()
    document = str(document_path or "").strip()
    if not prefix or not document:
        return False
    candidate = os.path.expanduser(prefix)
    try:
        return os.path.samefile(candidate, document)
    except (OSError, ValueError):
        pass
    if os.path.isabs(candidate):
        # Neither path is a file here (a document named but not on disk): compare them as paths.
        return os.path.normcase(os.path.realpath(candidate)) == os.path.normcase(os.path.realpath(document))
    return path_has_suffix(document, prefix)


def split_cad_ref(text: str) -> tuple[str, str]:
    """One ref as ``(file prefix, selector text)``; the prefix is ``""`` when it has none. A JSON-quoted
    prefix is decoded rather than cut at its first ``#``."""
    stripped = str(text or "").strip()
    quoted = QUOTED_PREFIX_RE.match(stripped)
    if quoted:
        try:
            return json.loads(quoted.group(1)), stripped[quoted.end():]
        except ValueError:
            pass
    prefix, hash_mark, selectors = stripped.partition("#")
    return (prefix.strip(), selectors) if hash_mark else ("", stripped)


def parse_selector(raw_selector: str, *, inherited_occurrence_id: str = "",
                   inherited_label: str = "") -> ParsedSelector | None:
    """One selector parsed (None when it is empty); a bare entity takes the occurrence or the label
    named before it on the line. Only a leading ``#`` is the ref's marker."""
    selector = str(raw_selector or "").strip()
    if selector.startswith("#"):
        selector = selector[1:]
    if not selector:
        return None

    found = OCCURRENCE_ENTITY_SELECTOR_RE.match(selector)
    if found:
        occurrence_id, kind, ordinal = f"o{found.group(1)}", found.group(2), int(found.group(3))
        return ParsedSelector(_KINDS[kind], occurrence_id, ordinal, f"{occurrence_id}.{kind}{ordinal}")

    found = OCCURRENCE_SELECTOR_RE.match(selector)
    if found:
        occurrence_id = f"o{found.group(1)}"
        return ParsedSelector("occurrence", occurrence_id, None, occurrence_id)

    found = ENTITY_SELECTOR_RE.match(selector)
    if found:
        kind, ordinal = found.group(1), int(found.group(2))
        if inherited_occurrence_id:
            return ParsedSelector(_KINDS[kind], inherited_occurrence_id, ordinal,
                                  f"{inherited_occurrence_id}.{kind}{ordinal}")
        if inherited_label:
            return ParsedSelector(_KINDS[kind], "", ordinal, f"{inherited_label}.{kind}{ordinal}", label=inherited_label)
        return ParsedSelector(_KINDS[kind], "", ordinal, f"{kind}{ordinal}")

    # Label forms only after every numeric form has had its chance, so a numeric ref never changes
    # meaning. Mates look like labels and are excluded.
    if not MATE_SELECTOR_RE.match(selector):
        found = LABEL_ENTITY_SELECTOR_RE.match(selector)
        if found:
            label, kind, ordinal = found.group(1), found.group(2), int(found.group(3))
            return ParsedSelector(_KINDS[kind], "", ordinal, f"{label}.{kind}{ordinal}", label=label)
        found = LABEL_SELECTOR_RE.match(selector)
        if found:
            return ParsedSelector("label", "", None, found.group(1), label=found.group(1))

    return ParsedSelector("opaque", "", None, selector)


def parse_selector_list(raw_selector_list: str) -> list[ParsedSelector | None]:
    """Each comma-separated selector, parsed in order; None where one is empty. A bare entity inherits
    the occurrence or label named before it, so ``o1.2,f3`` is ``o1.2`` and ``o1.2.f3``."""
    parsed_list: list[ParsedSelector | None] = []
    inherited_occurrence_id = ""
    inherited_label = ""
    for raw_selector in str(raw_selector_list or "").split(","):
        parsed = parse_selector(raw_selector, inherited_occurrence_id=inherited_occurrence_id,
                                inherited_label=inherited_label)
        parsed_list.append(parsed)
        if parsed is None:
            continue
        if parsed.occurrence_id:
            inherited_occurrence_id, inherited_label = parsed.occurrence_id, ""
        elif parsed.label:
            inherited_label, inherited_occurrence_id = parsed.label, ""
    return parsed_list
