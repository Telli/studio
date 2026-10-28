#!/usr/bin/env python3
"""Renders the library's pictures from Studio's examples' real files.

libraryExamples.json names each library entry's example, in studio-sample/servo-bracket unless the
entry names another example (`sample`), and the file its picture is made from. A Markdown example
("page") is drawn live from its own text; every other picture is rendered here into the library's
pictures/, as <its path, "/" as "__">.webp (another example's with its id and "__" first), 640x400
at WebP quality 80:

- models, meshes, the DXF and the robot descriptions: cadgen's snapshot, in one run, as Studio's
  project page renders its pictures;
- a study's or a CAM job's result (`.fea.glb`, `.cam.glb`): kept as it is, since cadgen 0.8's
  snapshot draws a result's mesh but not its stress colours or toolpaths; drawn only when it has
  no picture yet. `pictures/kept-results.json` holds the SHA-256 of the result each kept picture
  shows, and a result that changed since is refused, by name: its picture would show another
  result;
- the drawing (PDF): its first page, by pdftoppm at 110 dpi;
- the motion video (MP4): its frame at one second, by ffmpeg;
- the examples' own pictures (PNG, JPG): as they are.

Each example's card picture (its studio-sample.json `picture`) is bundled too, as
pictures/examples/<id>.webp at the same size and quality, so every client shows it without reading
the server's disk.

Each keeps its whole frame, any room left filled with its own background. A picture no entry names
any more is removed. Nothing is written into the examples, and the scratch folder is removed.

    text-to-cad/.venv/bin/python scripts/studio-library-pictures.py

cadgen's snapshot asks its engine, which listens on a loopback port, so a sandbox that refuses local
sockets refuses the run. Set CADGEN_STATE_DIR, CADGEN_CACHE_DIR, CADGEN_ENGINE_DIR and
CADGEN_ENGINE_PORT to keep the run off cadgen's own engine.
"""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SAMPLES = ROOT / "studio-sample"
SAMPLE = "servo-bracket"
LIBRARY = ROOT / "apps" / "web" / "src" / "components" / "workbench" / "library"
PICTURES = LIBRARY / "pictures"
SIZE = (640, 400)

# The files cadgen's snapshot renders, by ending; it picks the format's own snapshot by the same.
CADGEN = {".step", ".stp", ".stl", ".3mf", ".glb", ".dxf", ".urdf", ".srdf", ".sdf"}
# Results whose pictures cadgen 0.8 cannot draw again: their colours and paths are not drawn.
KEPT = (".fea.glb", ".cam.glb")
# Drawn flat, in the gutter cadgen leaves around a drawing, so they take no padding.
FLAT = {".dxf"}
PHOTOS = {".png", ".jpg", ".jpeg"}
# Each kept result picture's result, by the picture's name: {"source": "<example>/<path>", "sha256": ...}.
KEPT_RESULTS = PICTURES / "kept-results.json"


def picture_path(path: str, sample: str = SAMPLE) -> str:
    """A picture's file name: its path in its example with each "/" as "__", then ".webp"; another
    example's with its id and "__" first."""
    return ("" if sample == SAMPLE else f"{sample}__") + path.replace("/", "__") + ".webp"


def drawn(name: str, scratch: Path) -> Path:
    """Where a picture's raster is drawn in the scratch folder."""
    return scratch / f"{name}.png"


def pictured() -> list[tuple[str, str]]:
    """Each (example, file) an entry is pictured by, once, in the order the entries name them."""
    examples = json.loads((LIBRARY / "libraryExamples.json").read_text(encoding="utf-8"))
    return list(
        dict.fromkeys(
            (item.get("sample", SAMPLE), item["picture"])
            for item in examples.values()
            if item is not None and item["picture"] != "page"
        )
    )


def job(sample: str, path: str, scratch: Path) -> dict:
    """cadgen's snapshot job for one file, with the padding Studio's project page gives a model."""
    padding = {} if Path(path).suffix.lower() in FLAT else {"output": {"padding": 0.08}}
    return {
        "input": str(SAMPLES / sample / path),
        "outputs": [{"path": str(drawn(picture_path(path, sample), scratch))}],
        **padding,
    }


def render(files: list[tuple[str, str]], scratch: Path) -> None:
    """cadgen's snapshot of each file, at the pictures' size, into the scratch folder."""
    job_file = scratch / "jobs.json"
    job_file.write_text(json.dumps({"jobs": [job(sample, path, scratch) for sample, path in files]}), encoding="utf-8")
    subprocess.run(
        [sys.executable, "-m", "cadgen.cli", "snapshot", "--job", str(job_file)]
        + ["--width", str(SIZE[0]), "--height", str(SIZE[1])],
        check=True,
        env=dict(os.environ),
    )


def raster(sample: str, path: str, scratch: Path) -> Path:
    """The picture's source as a raster: the picture itself, the PDF's first page, the video's
    frame at one second, or cadgen's render (`render`)."""
    source = SAMPLES / sample / path
    suffix = source.suffix.lower()
    target = drawn(picture_path(path, sample), scratch)
    if suffix in PHOTOS:
        return source
    if suffix == ".pdf":
        # pdftoppm writes its page to <prefix>.png.
        subprocess.run(
            ["pdftoppm", "-png", "-r", "110", "-f", "1", "-l", "1", "-singlefile", str(source)]
            + [str(target.with_suffix(""))],
            check=True,
        )
    elif suffix == ".mp4":
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-ss", "1", "-i", str(source), "-frames:v", "1", str(target)],
            check=True,
        )
    elif suffix not in CADGEN:
        raise SystemExit(f"{sample}/{path}: no renderer for {suffix} files")
    return target


def sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def kept_results(files: list[tuple[str, str]]) -> set[tuple[str, str]]:
    """The results whose pictures are kept: each one's picture there and its result the one the
    picture was drawn from. A result that changed since its picture refuses the run."""
    recorded = json.loads(KEPT_RESULTS.read_text(encoding="utf-8")) if KEPT_RESULTS.is_file() else {}
    kept, changed = set(), []
    for sample, path in files:
        name = picture_path(path, sample)
        if not path.endswith(KEPT) or not (PICTURES / name).is_file():
            continue
        now = sha256(SAMPLES / sample / path)
        if recorded.get(name, {}).get("sha256") != now:
            changed.append(f"{sample}/{path}")
        kept.add((sample, path))
    if changed:
        raise SystemExit(f"{', '.join(changed)}: changed since its picture was drawn, and cadgen 0.8 cannot draw a "
                         "result's colours or toolpaths again; point the entry at a result its picture shows, or "
                         "remove the picture to draw it plain")
    return kept


def record_results(files: list[tuple[str, str]]) -> None:
    """The SHA-256 of each result a picture shows, beside the pictures (`kept_results`)."""
    shown = {picture_path(path, sample): {"source": f"{sample}/{path}", "sha256": sha256(SAMPLES / sample / path)}
             for sample, path in files if path.endswith(KEPT)}
    KEPT_RESULTS.write_text(json.dumps(shown, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def fit(image: Image.Image) -> Image.Image:
    """The whole picture at the pictures' size, any room left in its own background (its corner)."""
    image = image.convert("RGB")
    return ImageOps.pad(image, SIZE, method=Image.Resampling.LANCZOS, color=image.getpixel((0, 0)))


def main() -> int:
    files = pictured()
    PICTURES.mkdir(exist_ok=True)
    kept = kept_results(files)
    with tempfile.TemporaryDirectory(prefix="studio-library-pictures-") as folder:
        scratch = Path(folder)
        models = [(sample, path) for sample, path in files
                  if Path(path).suffix.lower() in CADGEN and (sample, path) not in kept]
        if models:
            render(models, scratch)
        for sample, path in files:
            name = picture_path(path, sample)
            if (sample, path) in kept:
                print(f"pictures/{name}, kept: cadgen 0.8 cannot draw {path}'s result again")
                continue
            with Image.open(raster(sample, path, scratch)) as image:
                fit(image).save(PICTURES / name, "WEBP", quality=80)
            print(f"pictures/{name}, from {sample}/{path}")
    record_results(files)
    named = {picture_path(path, sample) for sample, path in files}
    for picture in PICTURES.glob("*.webp"):
        if picture.name not in named:
            picture.unlink()
            print(f"removed pictures/{picture.name}")
    (PICTURES / "examples").mkdir(exist_ok=True)
    for marker in sorted(SAMPLES.glob("*/studio-sample.json")):
        card = marker.parent / json.loads(marker.read_text(encoding="utf-8"))["picture"]
        with Image.open(card) as image:
            fit(image).save(PICTURES / "examples" / f"{marker.parent.name}.webp", "WEBP", quality=80)
        print(f"pictures/examples/{marker.parent.name}.webp, from {marker.parent.name}/{card.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
