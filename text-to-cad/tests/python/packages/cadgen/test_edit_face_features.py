"""Which feature made each face of a part (``cadgen.edit.face_features``): each reading of a part by
the edit service says, for every face by the number the viewer's references give it (``f12``), the
feature of the first traced step whose result has a face on the same surface (``faceFeatures``), and
how many faces that body has (``faceCount``); the rollback bar's body says it for its own faces.

They drive the edit service end to end, as the viewer's server does, on ``test_edit_commands.py``'s
parts. The faces are numbered as the viewer numbers them (``faces_on_screen``): the part made by its
script as a build makes it, written as its build writes its STEP, and read back by its selectors as
the viewer reads that STEP. The surface keys are read on build123d's own faces (``SurfaceKeys``).
"""

from __future__ import annotations

import math
import os
import runpy
import sys
import unittest
from pathlib import Path
from unittest import mock

from tests.python.packages.cadgen import test_edit_commands as parts

# PLATE placed at its end, as a part returned as ``Pos(...) * body`` is, and moved in place there.
PLACED = {"plate.py": parts.PLATE["plate.py"].replace("return plate", "return bd.Pos(0, 0, 10) * plate")}
MOVED = {"plate.py": parts.PLATE["plate.py"].replace(
    "            return plate", "            plate.move(bd.Location((0, 0, 10)))\n            return plate")}

# A loft from a square up to a circle: its sides are free-form (B-spline) surfaces, its ends flat.
FUNNEL = {
    "funnel.py": """
        from build123d import Circle, Plane, Rectangle, loft
        from cadgen import step


        @step
        def funnel():
            base = Rectangle(20, 20)
            top = Plane.XY.offset(15) * Circle(5)
            return loft([base, top])
    """,
}

# PLATE's top edges as the viewer reads them, for an Edge Blend on them.
HALF_LENGTH, HALF_WIDTH, TOP = 25.4, 12.7, 3.175
PLATE_TOP_EDGES = [parts.edge("e1", (0, -HALF_WIDTH, TOP), 50.8), parts.edge("e2", (0, HALF_WIDTH, TOP), 50.8),
                   parts.edge("e3", (-HALF_LENGTH, 0, TOP), 25.4), parts.edge("e4", (HALF_LENGTH, 0, TOP), 25.4)]


def faces_on_screen(script: Path) -> dict[int, object]:
    """A part's faces by the numbers the viewer's references give them (``f12`` is 12): the part made
    by its script as a build makes it (its model's own function, run here), written as its build
    writes its STEP (``build_tree_through_step``), and read back by its selectors (``read_scene``),
    in a store of the project's own."""
    from cadgen.step_scene import read_scene
    from cadgen.store.build import build_tree_through_step

    folder = str(script.parent)
    sys.path.insert(0, folder)
    try:
        made = runpy.run_path(str(script), run_name=f"made_{script.stem}")
        model = next(value.__cadgen_model__ for value in made.values() if hasattr(value, "__cadgen_model__"))
        shape = model.func()
    finally:
        sys.path.remove(folder)
    step = script.with_suffix(".step")
    with mock.patch.dict(os.environ, {"CADGEN_CACHE_DIR": str(script.parent / ".store")}):
        build_tree_through_step(shape, step, root_name=script.stem)
        (leaf,) = read_scene(step).leaves()
        return {face.ordinal: face.shape() for face in leaf.entities("face")}


def faces_of(shape) -> dict[int, object]:
    """A shape's faces by their numbers on it, as the viewer numbers a tree's faces (``entity_map``)."""
    from build123d import Face
    from OCP.TopoDS import TopoDS

    from cadgen._internal.entity_ordinals import entity_map

    found = entity_map(shape.wrapped, "face")
    return {number: Face(TopoDS.Face_s(found.FindKey(number))) for number in range(1, found.Extent() + 1)}


def kind(face) -> str:
    """``plane``, ``cylinder``, ``torus``, ``bspline``: a face's surface as build123d names it."""
    return face.geom_type.name.lower()


def is_round(face, radius: float) -> bool:
    return kind(face) == "cylinder" and math.isclose(face.radius, radius, rel_tol=1e-9)


class FaceFeatures(parts.Commands):
    def key(self, state: dict, feature_kind: str) -> str:
        return next(feature["key"] for feature in state["features"] if feature["kind"] == feature_kind)

    def test_credits_a_face_a_later_hole_cuts_through_to_the_block_that_made_it(self):
        from build123d import CenterOf

        root, file, state = self.open(parts.PLATE, "plate.step")
        plate, hole = self.key(state, "Boss-Extrude"), self.key(state, "Hole")
        faces = faces_on_screen(root / "plate.py")
        top = next(number for number, face in faces.items()
                   if kind(face) == "plane" and math.isclose(face.center(CenterOf.MASS).Z, TOP))
        wall = next(number for number, face in faces.items() if kind(face) == "cylinder")
        self.assertEqual(state["faceFeatures"][str(top)], plate)
        self.assertEqual(state["faceFeatures"][str(wall)], hole)
        # Every face is known, by the number the viewer gives it: the block's six, the hole's wall.
        self.assertEqual(state["faceFeatures"], {str(number): hole if number == wall else plate for number in faces})
        self.assertEqual(state["faceCount"], len(faces))
        # And that number is the one a command takes the face by, sent as a selector alone, as the edit tests send one: the top's edges.
        chamfered = self.command(file, state, "chamfer", [{"selector": f"f{top}"}], {"distance": ".02"})
        self.assertTrue(chamfered["ok"], chamfered.get("error"))
        line = next(line for line in (root / "plate.py").read_text(encoding="utf-8").splitlines() if "bd.chamfer(" in line)
        self.assertIn(".group_by(bd.Axis.Z)[-1]", line)
        self.assertEqual(chamfered["change"]["what"], "5 edges")

    def test_credits_a_fillets_round_face_to_the_fillet(self):
        root, file, state = self.open(parts.PLATE, "plate.step")
        made = self.command(file, state, "fillet", PLATE_TOP_EDGES, {"radius": ".05"})
        self.assertTrue(made["ok"], made.get("error"))
        plate, hole, fillet = self.key(made, "Boss-Extrude"), self.key(made, "Hole"), self.key(made, "Fillet")
        self.assertEqual(fillet, made["change"]["row"])
        faces = faces_on_screen(root / "plate.py")
        credited = made["faceFeatures"]
        rounds = [number for number, face in faces.items() if is_round(face, .05 * 25.4)]
        self.assertEqual(len(rounds), 4)
        self.assertEqual({credited[str(number)] for number in rounds}, {fillet})
        # The hole's wall stays the hole's, and the block's planes, trimmed by the rounds, the block's.
        (wall,) = [number for number, face in faces.items() if is_round(face, .1 * 25.4)]
        self.assertEqual(credited[str(wall)], hole)
        self.assertEqual({credited[str(number)] for number, face in faces.items() if kind(face) == "plane"}, {plate})
        self.assertEqual(len(credited), len(faces))

    def test_leaves_out_a_face_it_cannot_key(self):
        root, file, state = self.open(FUNNEL, "funnel.step")
        loft = next(feature["key"] for feature in state["features"] if "Loft" in feature["kind"])
        faces = faces_on_screen(root / "funnel.py")
        free = [number for number, face in faces.items() if kind(face) == "bspline"]
        self.assertTrue(free)
        for number in free:
            self.assertNotIn(str(number), state["faceFeatures"])
        # Its flat ends are known, and the loft made them.
        self.assertEqual(state["faceFeatures"], {str(number): loft for number, face in faces.items() if kind(face) == "plane"})
        self.assertEqual(state["faceCount"], len(faces))

    def test_has_no_map_for_an_assembly(self):
        root, file, state = self.open(parts.ASSEMBLY, "assemblies/stack.step")
        self.assertEqual([component["name"] for component in state["components"]], ["base", "pin"])
        self.assertEqual(state["faceFeatures"], {})

    def test_credits_a_rolled_back_bodys_faces_only_to_features_above_the_bar(self):
        from cadgen.store.lazy import materialize_model

        root, file, state = self.open(parts.PLATE, "plate.step")
        plate, hole = self.key(state, "Boss-Extrude"), self.key(state, "Hole")
        line = next(feature["line"] for feature in state["features"] if feature["kind"] == "Hole")
        rolled = self.service.change({"file": file, "files": state["files"], "bar": {"before": f"plate.py:{line}"}})
        self.assertTrue(rolled["ok"], rolled.get("error"))
        bar = rolled["bar"]
        self.assertEqual(bar["item"], hole)
        # The block before its hole, as the tree the viewer draws for the bar numbers its faces: six, each the block's.
        body = faces_of(materialize_model(bar["tree"], label="plate"))
        self.assertEqual({kind(face) for face in body.values()}, {"plane"})
        self.assertEqual(bar["faceFeatures"], {str(number): plate for number in body})
        self.assertEqual(bar["faceCount"], len(body))
        # The part as a whole still has the hole's wall.
        self.assertIn(hole, state["faceFeatures"].values())

    def test_a_bar_above_a_fillet_credits_the_hole_above_it_and_not_the_fillet(self):
        from cadgen.store.lazy import materialize_model

        root, file, state = self.open(parts.PLATE, "plate.step")
        made = self.command(file, state, "fillet", PLATE_TOP_EDGES, {"radius": ".05"})
        self.assertTrue(made["ok"], made.get("error"))
        plate, hole, fillet = self.key(made, "Boss-Extrude"), self.key(made, "Hole"), self.key(made, "Fillet")
        rolled = self.service.change({"file": file, "files": made["files"], "bar": {"item": fillet}})
        self.assertTrue(rolled["ok"], rolled.get("error"))
        body = faces_of(materialize_model(rolled["bar"]["tree"], label="plate"))
        (wall,) = [number for number, face in body.items() if kind(face) == "cylinder"]
        self.assertEqual(rolled["bar"]["faceFeatures"], {str(number): hole if number == wall else plate for number in body})
        self.assertNotIn(fillet, rolled["bar"]["faceFeatures"].values())

    def test_a_body_placed_at_its_end_keeps_the_features_that_made_its_faces(self):
        for name, files in (("placed", PLACED), ("moved in place", MOVED)):
            with self.subTest(name):
                root, file, state = self.open(files, "plate.step")
                plate, hole = self.key(state, "Boss-Extrude"), self.key(state, "Hole")
                faces = faces_on_screen(root / "plate.py")
                (wall,) = [number for number, face in faces.items() if kind(face) == "cylinder"]
                self.assertEqual(state["faceFeatures"], {str(number): hole if number == wall else plate for number in faces})


class SurfaceKeys(unittest.TestCase):
    """``surface_key``: the surface a face lies on, as one key, whichever way the face faces."""

    def test_a_plane_is_one_surface_whichever_way_its_face_faces(self):
        from build123d import Axis, Box, Face, Pos

        from cadgen.edit.face_features import surface_key

        box = Box(10, 20, 30)
        top = box.faces().sort_by(Axis.Z)[-1]
        front = box.faces().sort_by(Axis.Y)[0]
        flipped = Face(top.wrapped.Reversed())
        self.assertIsNotNone(surface_key(top, size=10))
        self.assertEqual(surface_key(flipped, size=10), surface_key(top, size=10))
        self.assertEqual(surface_key(Face(front.wrapped.Reversed()), size=10), surface_key(front, size=10))
        # Another box's top on the same plane is that plane; its bottom, the plane below, is not.
        other = Pos(40, 0, 0) * Box(5, 5, 30)
        self.assertEqual(surface_key(other.faces().sort_by(Axis.Z)[-1], size=10), surface_key(top, size=10))
        self.assertNotEqual(surface_key(box.faces().sort_by(Axis.Z)[0], size=10), surface_key(top, size=10))

    def test_a_cylinder_is_its_axis_line_and_radius(self):
        from build123d import Cylinder, Pos, Rot

        from cadgen.edit.face_features import surface_key

        def wall(shape):
            return next(face for face in shape.faces() if face.geom_type.name == "CYLINDER")

        up = wall(Cylinder(2, 10))
        # The same axis line turned end over end, or slid along itself, is the same cylinder.
        self.assertEqual(surface_key(wall(Rot(180, 0, 0) * Cylinder(2, 10)), size=10), surface_key(up, size=10))
        self.assertEqual(surface_key(wall(Pos(0, 0, 7) * Cylinder(2, 4)), size=10), surface_key(up, size=10))
        self.assertNotEqual(surface_key(wall(Pos(1, 0, 0) * Cylinder(2, 10)), size=10), surface_key(up, size=10))
        self.assertNotEqual(surface_key(wall(Cylinder(3, 10)), size=10), surface_key(up, size=10))

    def test_a_cone_a_sphere_and_a_torus_are_their_own_surfaces_turned_end_over_end(self):
        from build123d import Cone, Pos, Rot, Sphere, Torus

        from cadgen.edit.face_features import surface_key

        def curved(shape):
            (face,) = [face for face in shape.faces() if face.geom_type.name in ("CONE", "SPHERE", "TORUS")]
            return surface_key(face, size=20)

        for name, made, turned, other in (
            # A cone narrowing up, and the cone widening up turned over: one surface through one apex.
            ("cone", Cone(5, 2, 10), Rot(180, 0, 0) * Cone(2, 5, 10), Cone(5, 1, 10)),
            ("sphere", Sphere(3), Rot(30, 40, 0) * Sphere(3), Pos(0, 0, 1) * Sphere(3)),
            ("torus", Torus(10, 2), Rot(180, 0, 0) * Torus(10, 2), Torus(10, 3)),
        ):
            with self.subTest(name):
                self.assertIsNotNone(curved(made))
                self.assertEqual(curved(turned), curved(made))
                self.assertNotEqual(curved(other), curved(made))

    def test_a_part_in_inches_keys_as_the_same_part_in_millimetres(self):
        from build123d import Box, Cylinder, Pos

        from cadgen.edit.face_features import surface_key

        def part(scale):
            return Box(2 * scale, 1 * scale, .25 * scale) - Pos(.5 * scale, .1 * scale, 0) * Cylinder(.1 * scale, .25 * scale)

        inches, millimetres = part(1), part(25.4)
        keys = [surface_key(face, size=inches.bounding_box().diagonal) for face in inches.faces()]
        self.assertEqual([surface_key(face, size=millimetres.bounding_box().diagonal) for face in millimetres.faces()], keys)
        self.assertNotIn(None, keys)

    def test_a_free_form_face_has_no_key(self):
        from build123d import Circle, Plane, Rectangle, loft

        from cadgen.edit.face_features import surface_key

        funnel = loft([Rectangle(20, 20), Plane.XY.offset(15) * Circle(5)])
        free = [face for face in funnel.faces() if face.geom_type.name == "BSPLINE"]
        self.assertTrue(free)
        self.assertEqual({surface_key(face, size=30) for face in free}, {None})


if __name__ == "__main__":
    unittest.main()
