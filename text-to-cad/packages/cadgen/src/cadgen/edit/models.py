"""Studio's list of a project folder's models (``GET /__cad/models?root=``): every model the engine's
registry records whose script is in the folder, so the workbench lists a project's 0.8 parts by their
document ids. It reads the registry alone (no kernel, no build), all of it -- not Recents, which keeps
the 200 most recent of every project -- and leaves out what is no part of the project: a shape handed
over (CAD mode's rollback bar's body is one), a file opened, and a model whose script is gone."""

from __future__ import annotations

import os
from pathlib import Path


def folder_models(registry, root: str) -> dict:
    """``{models: [{id, name, script, kind, updated}]}`` for the folder ``root`` (any spelling: it is
    resolved as the registry's paths are, so ``/tmp`` and ``/private/tmp`` are one folder). ``script``
    is relative to the folder, with ``/``; ``kind`` is ``part`` or ``assembly`` as the last build's
    facts count its parts (None before the engine has them); ``updated`` is when it was last built."""
    from cadgen.engine import registry as registering

    if not root or not os.path.isabs(root):
        raise ValueError("GET /__cad/models needs ?root=<a project folder's absolute path>")
    folder = Path(os.path.realpath(root))
    models = []
    for record in registry.list() if registry is not None else []:
        if record.get("kind") != "model":
            continue
        try:
            script = Path(os.path.realpath(registering.home(registry, record)))
        except (KeyError, TypeError, ValueError, OSError):
            continue
        if folder not in script.parents or not script.is_file():
            continue
        facts = record.get("facts") if isinstance(record.get("facts"), dict) else {}
        parts = facts.get("parts")
        models.append({
            "id": record["id"],
            "name": record.get("name") or record.get("entry") or script.stem,
            "script": script.relative_to(folder).as_posix(),
            "kind": None if not isinstance(parts, int) else "assembly" if parts > 1 else "part",
            "updated": record.get("built"),
        })
    models.sort(key=lambda model: (model["script"], model["name"]))
    return {"models": models}
