"""The scene adapter FEA, CAM, manufacturing checks, work instructions and drawings read a part through
(``cadgen._internal.step_open``): a STEP, an xbf or a model's document id opened as one scene, and a face
named in either grammar -- the engine's (``plate/face 3``, ``f:...``) or 0.7's (``#o1.f3``) -- resolved
to the one ordinal the engine numbers it by."""

from __future__ import annotations

import contextlib
import json
import os
import sys
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest import mock

from tests.python.support import engine_daemon
from tests.python.support.cam_fixtures import mill_job, quiet
from tests.python.support.fea_fixtures import needs_fea

SRC = Path(__file__).resolve().parents[4] / "packages" / "cadgen" / "src"

BLOCK = """
import build123d as bd
from cadgen import model


@model
def block():
    body = bd.Box(80, 60, 25, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
    pocket = bd.Pos(0, 0, 15) * bd.Box(40, 30, 10, align=(bd.Align.CENTER, bd.Align.CENTER, bd.Align.MIN))
    block = body - pocket
    block.label = "block"
    return block


if __name__ == "__main__":
    block()
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
        self.assertEqual([s.ref for s in scene.resolve("#post,f1")], ["#o1.2", "#o1.2.f1"])

    def test_what_names_nothing_is_refused_saying_why(self) -> None:
        from cadgen._internal.step_open import open_scene

        scene = open_scene(self.kit)
        for ref, said in (("#o1.2.f99", r"available: 1\.\.6"), ("#f1", "needs an occurrence prefix"),
                          ("#o7", "unknown occurrence"), ("other.step#o1.1.f1", "names other.step"),
                          ("post/face 99", r"available: 1\.\.6"), ("nothing/face 1", "no part or assembly nothing"),
                          ("#o1.f1", "is a group"), ("#o1.2.f1,post/face 2", "one grammar per line"),
                          ("#o1.2.f1,,f2", "an empty selector")):
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
        cls.folder = Path(os.path.realpath(folder.name))
        script = cls.folder / "block.py"
        script.write_text(textwrap.dedent(BLOCK), encoding="utf-8")
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
        self.assertEqual((scene.document, scene.stem, leaf.ref), (self.ident, "block", "#o1.1"))
        names = scene.structure["prototypes"][0]["faceNames"]
        for ordinal in range(1, len(list(leaf.entities("face"))) + 1):
            with self.subTest(face=ordinal):
                refs = [f"#o1.1.f{ordinal}", f"#o1.f{ordinal}", f"#f{ordinal}", f"face {ordinal}",
                        f"block/face {ordinal}", f"{self.ident}#o1.1.f{ordinal}"]
                if str(ordinal) in names:
                    refs.append(names[str(ordinal)])  # its element name, f:block.body.N...
                found = {(s.occurrence_ref, s.ordinal) for ref in refs for s in scene.resolve(ref)}
                self.assertEqual(found, {("#o1.1", ordinal)})
                # The engine's own face N is the vendored ordinal's face: the same area and centre.
                facts = cadgen.inspect(self.ident, f"face {ordinal}", progress=False)
                area, centre = _area_centre(scene.resolve(f"face {ordinal}")[0].shape())
                self.assertAlmostEqual(facts["area"], area, places=5)
                for x, y in zip(facts["centroid"], centre):
                    self.assertAlmostEqual(x, y, places=5)
        self.assertTrue(names, "a model's faces carry the engine's element names")

    def _face(self, normal_z: float, z: float) -> int:
        """The ordinal of the block's planar face at height ``z`` facing up (1) or down (-1)."""
        from cadgen._internal.step_open import open_scene

        (leaf,) = open_scene(self.ident).leaves()
        for face in leaf.entities("face"):
            shape = face.shape()
            if abs(_area_centre(shape)[1][2] - z) < 1e-6 and shape.normal_at().Z == normal_z:
                return face.ordinal
        raise AssertionError(f"no face at z {z}")

    def _in_folder(self) -> Path:
        """A working directory of the test's own: a document id's outputs go in the working directory."""
        folder = Path(tempfile.mkdtemp(prefix="by-id-", dir=self.folder))
        self.enterContext(contextlib.chdir(folder))
        return folder

    def test_a_cam_job_names_faces_and_edges_in_either_grammar(self) -> None:
        from cadgen._internal.cam.job import parse_job
        from cadgen._internal.cam.part import read_part

        floor, top = self._face(1, 15), self._face(1, 25)
        job = mill_job([{"op": "pocket", "tool": "T1", "faces": [f"block/face {floor}"]},
                        {"op": "trace", "tool": "T1", "depth_mm": 0.5, "edges": ["block/edge 1"]}])
        job["setups"][0]["orientation"] = f"block/face {top}"
        parsed = parse_job(job)
        self.assertEqual(parsed.setups[0].orientation, f"block/face {top}")
        self.assertEqual(parsed.setups[0].operations[0].faces, (f"block/face {floor}",))
        part = read_part(Path(self.ident))
        self.assertEqual(part.face(f"block/face {floor}"), part.face(f"#o1.1.f{floor}"))
        self.assertEqual(part.face(f"face {floor}").ref, f"#o1.1.f{floor}")

    def test_cam_by_id_names_its_outputs_after_the_model(self) -> None:
        from cadgen import cam

        folder = self._in_folder()
        floor = self._face(1, 15)
        job = mill_job([{"op": "face", "tool": "T1"}, {"op": "pocket", "tool": "T1", "faces": [f"face {floor}"]}])
        with quiet():
            result = cam.plan(self.ident, job=job)
        self.assertTrue(result.ok, result.findings)
        self.assertEqual(sorted(path.name for path in folder.iterdir()), ["block.cam.glb", "block.top.nc"])

    @needs_fea
    def test_fea_and_a_manufacturing_check_by_id_name_their_results_after_the_model(self) -> None:
        from cadgen import fea, manufacturing

        folder = self._in_folder()
        bottom, top, floor = self._face(-1, 0), self._face(1, 25), self._face(1, 15)
        with quiet():
            solved = fea.solve(self.ident, study={"material": "aluminum-6061-t6", "mesh": {"size_mm": 6.0},
                                                  "fixtures": [{"faces": [f"face {bottom}"]}],
                                                  "loads": [{"faces": [f"#o1.f{top}"], "type": "force",
                                                             "vector_N": [0, 0, -500]}]})
        self.assertTrue(solved.ok, solved.findings)
        self.assertEqual((solved.glb.name, solved.sidecar.name), ("block.fea.glb", "block.fea.json"))
        self.assertEqual(json.loads(solved.sidecar.read_text(encoding="utf-8"))["document"], self.ident)
        with quiet():
            checked = manufacturing.check(self.ident, study={
                "process": "machining", "material": "6061-t6", "operation": "milling",
                "tool": {"diameter_mm": 10, "flutes": 3}, "spindle_rpm": 8000, "feed_per_tooth_mm": 0.05,
                "depth_mm": 3, "width_mm": 0.5, "mesh": {"size_mm": 6.0},
                "cut_faces": [f"block/face {floor}"], "fixtures": [{"faces": [f"face {bottom}"]}]})
        self.assertTrue(checked.ok)
        self.assertTrue({"block.machining.glb", "block.machining.result.json"} <= {p.name for p in folder.iterdir()})

    def test_a_ref_naming_another_document_is_refused(self) -> None:
        from cadgen._internal.step_open import open_scene

        other = "00000000-0000-5000-8000-000000000000"
        with self.assertRaisesRegex(ValueError, f"names {other}"):
            open_scene(self.ident).resolve(f"{other}#face 1")


if __name__ == "__main__":
    unittest.main()
