#!/usr/bin/env python3
"""Renders the library's pictures from the sample project's real files.

libraryExamples.json names each library entry's example in studio-sample/servo-bracket and the file
its picture is made from. A Markdown example ("page") is drawn live from its own text; every other
picture is rendered here into the library's pictures/, as <its path, "/" as "__">.webp, 640x400 at
WebP quality 80:

- models, meshes, results, the DXF and the robot descriptions: cadgen's snapshot, in one run, as
  Studio's project page renders its pictures;
- the drawing (PDF): its first page, by pdftoppm at 110 dpi;
- the motion video (MP4): its frame at one second, by ffmpeg;
- the sample's own pictures (PNG, JPG): as they are.

Each keeps its whole frame, any room left filled with its own background. A picture no entry names
any more is removed. Nothing is written into the sample, and the scratch folder is removed.

    text-to-cad/.venv/bin/python scripts/studio-library-pictures.py

cadgen serves a model to its browser over a loopback socket, so a sandbox that refuses local
sockets refuses the run.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
SAMPLE = ROOT / "studio-sample" / "servo-bracket"
LIBRARY = ROOT / "apps" / "web" / "src" / "components" / "workbench" / "library"
PICTURES = LIBRARY / "pictures"
SIZE = (640, 400)

# The files cadgen's snapshot renders, by ending; it picks the format's own snapshot by the same.
CADGEN = {".step", ".stp", ".stl", ".3mf", ".glb", ".dxf", ".kicad_pcb", ".urdf", ".srdf", ".sdf"}
# Drawn flat, in the gutter cadgen leaves around a drawing or a board, so they take no padding.
FLAT = {".dxf", ".kicad_pcb"}
PHOTOS = {".png", ".jpg", ".jpeg"}

# The CAM job holds two see-through vises around its 24 mm part, which wash the part out in the
# plain look: its picture looks in along the jaws, from the side they leave open, close on the part
# and its toolpaths, in Preview's lighting and perspective.
VIEWS = {"cam/horn_adapter.cam.glb": {"preview": True, "camera": {"preset": "90:22", "zoom": 4}}}


def picture_path(sample_path: str) -> str:
    """A picture's file name: its path in the sample with each "/" as "__", then ".webp"."""
    return sample_path.replace("/", "__") + ".webp"


def drawn(path: str, scratch: Path) -> Path:
    """Where a file's raster is drawn in the scratch folder."""
    return scratch / f"{picture_path(path)}.png"


def pictured() -> list[str]:
    """Each file an entry is pictured by, once, in the order the entries name them."""
    examples = json.loads((LIBRARY / "libraryExamples.json").read_text(encoding="utf-8"))
    return list(
        dict.fromkeys(
            item["picture"]
            for item in examples.values()
            if item is not None and item["picture"] != "page"
        )
    )


def job(path: str, scratch: Path) -> dict:
    """cadgen's snapshot job for one file: its default view, or its own, with the padding Studio's
    project page gives a model."""
    padding = {} if Path(path).suffix.lower() in FLAT else {"output": {"padding": 0.08}}
    return {
        "input": str(SAMPLE / path),
        "outputs": [{"path": str(drawn(path, scratch))}],
        **padding,
        **VIEWS.get(path, {}),
    }


def render(paths: list[str], scratch: Path) -> None:
    """cadgen's snapshot of each file, at the pictures' size, into the scratch folder."""
    env = dict(os.environ)
    # cadgen's store in the temp folder, not the home folder's cache.
    env.setdefault("CADGEN_CACHE_DIR", str(Path(tempfile.gettempdir()) / "cadgen-store"))
    # cadgen's built Node builders, where a checkout has them, over its live ones (which need
    # text-to-cad's own node_modules).
    builders = ROOT / "text-to-cad" / "packages" / "cadgen" / "src" / "cadgen" / "_runtime" / "node"
    if builders.is_dir():
        env.setdefault("CADGEN_NODE_BUILDERS_DIR", str(builders))
    job_file = scratch / "jobs.json"
    jobs = [job(path, scratch) for path in paths]
    job_file.write_text(json.dumps({"jobs": jobs}), encoding="utf-8")
    subprocess.run(
        [sys.executable, "-m", "cadgen.cli", "snapshot", "--job", str(job_file)]
        + ["--width", str(SIZE[0]), "--height", str(SIZE[1])],
        check=True,
        env=env,
    )


def raster(path: str, scratch: Path) -> Path:
    """The picture's source as a raster: the picture itself, the PDF's first page, the video's
    frame at one second, or cadgen's render (`render`)."""
    source = SAMPLE / path
    suffix = source.suffix.lower()
    if suffix in PHOTOS:
        return source
    if suffix == ".pdf":
        # pdftoppm writes its page to <prefix>.png.
        subprocess.run(
            ["pdftoppm", "-png", "-r", "110", "-f", "1", "-l", "1", "-singlefile", str(source)]
            + [str(drawn(path, scratch).with_suffix(""))],
            check=True,
        )
    elif suffix == ".mp4":
        subprocess.run(
            ["ffmpeg", "-v", "error", "-y", "-ss", "1", "-i", str(source), "-frames:v", "1"]
            + [str(drawn(path, scratch))],
            check=True,
        )
    elif suffix not in CADGEN:
        raise SystemExit(f"{path}: no renderer for {suffix} files")
    return drawn(path, scratch)


def fit(image: Image.Image) -> Image.Image:
    """The whole picture at the pictures' size, any room left in its own background (its corner)."""
    image = image.convert("RGB")
    return ImageOps.pad(image, SIZE, method=Image.Resampling.LANCZOS, color=image.getpixel((0, 0)))


def main() -> int:
    paths = pictured()
    PICTURES.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="studio-library-pictures-") as folder:
        scratch = Path(folder)
        models = [path for path in paths if Path(path).suffix.lower() in CADGEN]
        if models:
            render(models, scratch)
        for path in paths:
            with Image.open(raster(path, scratch)) as image:
                fit(image).save(PICTURES / picture_path(path), "WEBP", quality=80)
            print(f"pictures/{picture_path(path)}, from {path}")
    named = {picture_path(path) for path in paths}
    for picture in PICTURES.glob("*.webp"):
        if picture.name not in named:
            picture.unlink()
            print(f"removed pictures/{picture.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
