"""The scene adapter FEA, CAM, manufacturing checks, work instructions and drawings read a part through
(``cadgen._internal.step_open``): a STEP, an xbf or a model's document id opened as one scene, and a face
named in either grammar -- the engine's (``plate/face 3``, ``f:...``) or 0.7's (``#o1.f3``) -- resolved
to the one ordinal the engine numbers it by."""

from __future__ import annotations

import os
import subprocess
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest import mock

from tests.python.support import engine_daemon

SRC = Path(__file__).resolve().parents[4] / "packages" / "cadgen" / "src"

PLATE = """
import build123d as bd
from cadgen import model


@model
def plate():
    body = bd.Box(40, 20, 6)
    hole = bd.Cylinder(3, 6)
    plate = body - hole
    plate.label = "plate"
    return plate


if __name__ == "__main__":
    plate()
"""


def _area_centre(shape) -> tuple[float, tuple[float, float, float]]:
    from OCP.BRepGProp import BRepGProp
    from OCP.GProp import GProp_GProps

    props = GProp_GProps()
    BRepGProp.SurfaceProperties_s(shape.wrapped if hasattr(shape, "wrapped") else shape, props)
    centre = props.CentreOfMass()
    return props.Mass(), (centre.X(), centre.Y(), centre.Z())


class Files(unittest.TestCase):
    """A STEP and the xbf made of it, read in this process: no engine."""

    @classmethod
    def setUpClass(cls) -> None:
        from build123d import Box, Compound, Pos, export_step

        folder = tempfile.TemporaryDirectory(prefix="step-open-")
        cls.addClassCleanup(folder.cleanup)
        cls.folder = Path(folder.name)
        box = Box(10, 20, 30)
        box.label = "block"
        cls.single = cls.folder / "block.step"
        export_step(box, str(cls.single))
        plate, post = Box(40, 40, 4), Pos(0, 0, 12) * Box(6, 6, 20)
        plate.label, post.label = "plate", "post"
        cls.kit = cls.folder / "kit.step"
        export_step(Compound(children=[plate, post], label="kit"), str(cls.kit))

    def test_a_one_part_step_names_its_face_alike_in_both_grammars(self) -> None:
        from cadgen._internal.step_open import open_scene

        scene = open_scene(self.single)
        (leaf,) = scene.leaves()
        self.assertEqual((leaf.ref, leaf.label, [root.ref for root in scene.roots]), ("#o1", "block", ["#o1"]))
        self.assertEqual(len(list(leaf.entities("face"))), 6)
        found = [scene.resolve(ref)[0] for ref in ("#o1.f3", "#f3", "face 3", "block/face 3", "block.step#o1.f3",
                                                   f"{self.single}#face 3")]
        self.assertEqual({(s.kind, s.occurrence_ref, s.ordinal, s.ref) for s in found}, {("face", "#o1", 3, "#o1.f3")})
        self.assertEqual(len({_area_centre(s.shape()) for s in found}), 1)

    def test_an_assemblys_part_is_one_occurrence_by_position_label_or_path(self) -> None:
        from cadgen._internal.step_open import open_scene

        scene = open_scene(self.kit)
        self.assertEqual([leaf.ref for leaf in scene.leaves()], ["#o1.1", "#o1.2"])
        self.assertEqual([child.label for child in scene.roots[0].children], ["plate", "post"])
        found = [scene.resolve(ref)[0] for ref in ("#o1.2.f1", "#post.f1", "post/face 1", "kit/post/face 1")]
        self.assertEqual({(s.occurrence_ref, s.ordinal) for s in found}, {("#o1.2", 1)})
        # Placed where the assembly puts it: the post stands on the plate.
        post = scene.resolve("post")[0]
        self.assertEqual(post.kind, "occurrence")
        box = post.shape().bounding_box()
        self.assertAlmostEqual(box.min.Z, 2.0, places=6)
        self.assertAlmostEqual(box.max.Z, 22.0, places=6)
        two = scene.resolve("#o1.2.f1,f2")
        self.assertEqual([s.ref for s in two], ["#o1.2.f1", "#o1.2.f2"])

    def test_what_names_nothing_is_refused_saying_why(self) -> None:
        from cadgen._internal.step_open import open_scene

        scene = open_scene(self.kit)
        for ref, said in (("#o1.2.f99", r"available: 1\.\.6"), ("#f1", "needs an occurrence prefix"),
                          ("#o7", "unknown occurrence"), ("other.step#o1.1.f1", "names other.step"),
                          ("post/face 99", r"available: 1\.\.6"), ("nothing/face 1", "no part or assembly nothing"),
                          ("#o1.f1", "is a group")):
            with self.subTest(ref=ref), self.assertRaisesRegex(ValueError, said):
                scene.resolve(ref)
        with self.assertRaisesRegex(ValueError, "is no part document"):
            open_scene(self.folder / "kit.stl")
        with self.assertRaises(FileNotFoundError):
            open_scene(self.folder / "missing.step")

    def test_an_xbf_reads_as_the_step_it_was_made_of(self) -> None:
        from cadgen._internal.step_open import open_scene
        from cadgen.engine.api import export

        xbf = self.folder / "kit.xbf"
        export(self.kit, xbf, daemon=False, progress=False)
        step, held = open_scene(self.kit), open_scene(xbf)
        self.assertEqual([leaf.ref for leaf in held.leaves()], [leaf.ref for leaf in step.leaves()])
        for ref in ("#o1.1.f5", "post/face 4"):
            with self.subTest(ref=ref):
                a, b = step.resolve(ref)[0], held.resolve(ref)[0]
                self.assertEqual((a.ref, a.ordinal), (b.ref, b.ordinal))
                area, centre = _area_centre(a.shape())
                other_area, other_centre = _area_centre(b.shape())
                self.assertAlmostEqual(area, other_area, places=6)
                for x, y in zip(centre, other_centre):
                    self.assertAlmostEqual(x, y, places=6)


class DocumentId(unittest.TestCase):
    """A model's document, by its id, through an engine of the test's own."""

    @classmethod
    def setUpClass(cls) -> None:
        engine_daemon.isolate(cls.addClassCleanup)
        patch = mock.patch.dict(os.environ, {"CADGEN_ENGINE_PORT": "0"})
        patch.start()
        cls.addClassCleanup(patch.stop)
        folder = tempfile.TemporaryDirectory(prefix="step-open-model-")
        cls.addClassCleanup(folder.cleanup)
        script = Path(os.path.realpath(folder.name)) / "plate.py"
        script.write_text(textwrap.dedent(PLATE), encoding="utf-8")
        env = {**os.environ, "PYTHONPATH": str(SRC)}
        built = engine_daemon.run([sys.executable, str(script)], cwd=script.parent, env=env)
        if built.returncode != 0:
            raise AssertionError(built.stderr)
        cls.ident = next(line.split()[1] for line in built.stdout.splitlines() if line.strip().startswith("id:"))

    def test_a_model_opens_by_its_id_and_its_faces_are_the_engines(self) -> None:
        import cadgen
        from cadgen._internal.step_open import open_scene

        scene = open_scene(self.ident)
        (leaf,) = scene.leaves()
        # A model's document is its root assembly with the part below it, as its STEP export reads.
        self.assertEqual((scene.document, scene.stem, leaf.ref), (self.ident, "plate", "#o1.1"))
        names = scene.structure["prototypes"][0]["faceNames"]
        for ordinal in range(1, len(list(leaf.entities("face"))) + 1):
            with self.subTest(face=ordinal):
                refs = [f"#o1.1.f{ordinal}", f"#o1.f{ordinal}", f"#f{ordinal}", f"face {ordinal}", f"plate/face {ordinal}",
                        f"{self.ident}#o1.1.f{ordinal}"]
                if str(ordinal) in names:
                    refs.append(names[str(ordinal)])  # its element name, f:plate.body.N...
                found = {(s.occurrence_ref, s.ordinal) for ref in refs for s in scene.resolve(ref)}
                self.assertEqual(found, {("#o1.1", ordinal)})
                # The engine's own face N is the vendored ordinal's face: the same area and centre.
                facts = cadgen.inspect(self.ident, f"face {ordinal}", progress=False)
                area, centre = _area_centre(scene.resolve(f"face {ordinal}")[0].shape())
                self.assertAlmostEqual(facts["area"], area, places=5)
                for x, y in zip(facts["centroid"], centre):
                    self.assertAlmostEqual(x, y, places=5)
        self.assertTrue(names, "a model's faces carry the engine's element names")

    def test_a_ref_naming_another_document_is_refused(self) -> None:
        from cadgen._internal.step_open import open_scene

        other = "00000000-0000-5000-8000-000000000000"
        with self.assertRaisesRegex(ValueError, f"names {other}"):
            open_scene(self.ident).resolve(f"{other}#face 1")


if __name__ == "__main__":
    unittest.main()
