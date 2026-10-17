"""Sketch mode (``cadgen.edit.sketching``, through the edit service): a sketch drawn, dimensioned
and changed in the viewer, written as lines of the part's script, then made into a feature.

The tracer runs in a process of its own, as the viewer's server runs it, on a small part in a
fresh folder; nothing is built (``build=False``).
"""

from __future__ import annotations

import shutil
import tempfile
import textwrap
import unittest
from pathlib import Path

from cadgen.edit import service as edit

PART = """
    from build123d import Box, Pos
    from cadgen import step

    WIDTH = 40

    @step
    def plate():
        part = Pos(0, 0, -5) * Box(WIDTH, 20, 5)
        return part
"""


def project(text: str = PART) -> Path:
    root = Path(tempfile.mkdtemp(prefix="cadgen-sketch-mode-"))
    (root / ".git").mkdir()
    (root / "plate.py").write_text(textwrap.dedent(text), encoding="utf-8")
    return root


class SketchMode(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = edit.EditService(build=False)

    @classmethod
    def tearDownClass(cls):
        cls.service.close()

    def setUp(self):
        self.root = project()
        self.addCleanup(shutil.rmtree, self.root, True)
        self.file = str(self.root / "plate.step")
        self.files = self.service.state(self.file)["files"]
        self.sketch = None

    def source(self) -> str:
        return (self.root / "plate.py").read_text(encoding="utf-8")

    def send(self, op: dict, **more) -> dict:
        target = {"file": self.sketch["file"], "line": self.sketch["line"], "name": self.sketch["name"]} if self.sketch else {}
        reply = self.service.change({"file": self.file, "files": self.files, "sketch": {**target, "op": op}, **more})
        self.assertTrue(reply.get("ok"), reply.get("error"))
        self.files = {**self.files, **(reply.get("files") or {})}
        if reply.get("sketch"):
            self.sketch = reply["sketch"]
        return reply

    def start(self, plane: str = "Top") -> dict:
        reply = self.send({"kind": "new", "plane": plane, "name": "Sketch1"})
        self.assertEqual(self.sketch["name"], "Sketch1")
        return reply

    def test_a_new_sketch_is_written_before_the_part_is_returned(self):
        self.start()
        text = self.source()
        self.assertIn("from cadgen.sketch import Sketch\n", text)
        self.assertIn('    sketch1 = Sketch("Sketch1", plane="Top")\n    return part\n', text)
        self.assertEqual(self.sketch["state"]["status"], "Fully defined")
        self.assertEqual(self.sketch["state"]["frame"]["z"], [0.0, 0.0, 1.0])

    def test_strokes_and_dimensions_are_lines_of_the_script_and_solve_at_once(self):
        self.start()
        drawn = self.send({"kind": "draw", "entity": "rectangle", "corner": {"point": "Origin"}, "opposite": {"at": [30, 10]}})
        self.assertTrue(drawn["sketchOnly"])
        self.assertIn("line1, line2, line3, line4 = sketch1.rectangle(sketch1.origin, (30, 10))", self.source())
        state = self.sketch["state"]
        self.assertEqual((state["status"], state["dof"]), ("Under defined", 2))
        self.send({"kind": "dimension", "dimension": "length", "refs": ["Line1"], "value": "25"})
        # The solve moved the drawn corner: the script says where it is now.
        self.assertIn("sketch1.rectangle(sketch1.origin, (25, 10))", self.source())
        self.assertIn("sketch1.length(line1, 25)", self.source())
        self.send({"kind": "dimension", "dimension": "length", "refs": ["Line4"], "value": "WIDTH / 4"})
        self.assertIn("sketch1.length(line4, WIDTH / 4)", self.source())
        self.assertEqual(self.sketch["state"]["status"], "Fully defined")
        right = next(point for point in self.sketch["state"]["points"] if point["id"] == "Point3")
        self.assertAlmostEqual(right["y"], 10.0)
        self.assertTrue(all(curve["defined"] for curve in self.sketch["state"]["curves"]))

    def test_a_dimension_typed_over_changes_its_number(self):
        self.start()
        self.send({"kind": "draw", "entity": "circle", "center": {"at": [10, 4]}, "radius": 2})
        self.send({"kind": "dimension", "dimension": "diameter", "refs": ["Circle1"], "value": "5"})
        self.send({"kind": "value", "dimension": "D1", "text": "6"})
        self.assertIn("sketch1.diameter(circle1, 6)", self.source())
        self.assertIn("circle1 = sketch1.circle((10, 4), 3)", self.source())

    def test_relations_that_cannot_hold_leave_the_script_as_it_was(self):
        self.start()
        self.send({"kind": "draw", "entity": "line", "start": {"at": [0, 0]}, "end": {"at": [10, 1]}, "relations": [{"kind": "horizontal"}]})
        before = self.source()
        refused = self.service.change({"file": self.file, "files": self.files, "sketch": {
            "file": self.sketch["file"], "line": self.sketch["line"], "op": {"kind": "relate", "relation": "vertical", "refs": ["Line1"]}}})
        self.assertFalse(refused["ok"])
        self.assertIn("can't all hold", refused["error"])
        self.assertEqual(self.source(), before)

    def test_a_rectangles_line_is_deleted_on_its_own(self):
        self.start()
        self.send({"kind": "draw", "entity": "rectangle", "corner": {"at": [0, 0]}, "opposite": {"at": [30, 10]}})
        self.send({"kind": "delete", "items": ["Line2"]})
        text = self.source()
        self.assertIn("line1 = sketch1.line((0, 0), (30, 0))", text)
        self.assertNotIn("line2 =", text)
        self.assertNotIn("sketch1.vertical(line2)", text)
        # The top line kept the corner the deleted side ended at, where it was.
        self.assertIn("line3 = sketch1.line((30, 10), (0, 10))", text)
        self.assertEqual([curve["id"] for curve in self.sketch["state"]["curves"]], ["Line1", "Line2", "Line3"])

    def test_undo_puts_a_stroke_back_and_answers_with_the_sketch(self):
        self.start()
        before = self.source()
        drawn = self.send({"kind": "draw", "entity": "line", "start": {"at": [0, 0]}, "end": {"at": [10, 0]}})
        target = {"file": self.sketch["file"], "line": self.sketch["line"], "name": "Sketch1"}
        undone = self.service.change({"file": self.file, "files": self.files, "splice": drawn["change"]["undo"], "sketch": target})
        self.assertTrue(undone["ok"], undone.get("error"))
        self.assertTrue(undone["sketchOnly"])
        self.assertEqual(self.source(), before)
        self.assertEqual(undone["sketch"]["state"]["curves"], [])

    def test_discarding_a_new_sketch_puts_the_script_back_and_builds_nothing(self):
        original = self.source()
        made = self.start()
        target = {"file": self.sketch["file"], "line": self.sketch["line"], "name": "Sketch1"}
        drawn = self.send({"kind": "draw", "entity": "circle", "center": {"at": [5, 5]}, "radius": 2})
        for change in (drawn["change"], made["change"]):
            undone = self.service.change({"file": self.file, "files": self.files, "splice": change["undo"], "sketch": target})
            self.assertTrue(undone["ok"], undone.get("error"))
            self.files = {**self.files, **(undone.get("files") or {})}
        # The sketch's making undone answers with the part, which nothing of the sketch was built into.
        self.assertFalse(undone.get("sketchOnly"))
        self.assertIs(undone["change"]["build"], False)
        self.assertEqual(self.source(), original)
        self.assertNotIn("Sketch1", [sketch["name"] for sketch in undone.get("sketches") or []])

    def test_a_sketch_of_its_own_is_deleted_with_its_lines(self):
        self.start()
        self.send({"kind": "draw", "entity": "circle", "center": {"at": [5, 5]}, "radius": 2})
        self.send({"kind": "exit", "changed": True})
        state = self.service.state(self.file)
        sketch = next(feature for feature in state["features"] if feature["kind"] == "Sketch")
        reply = self.service.change({"file": self.file, "files": state["files"], "remove": {"feature": sketch["key"], "title": "Sketch1"}})
        self.assertTrue(reply["ok"], reply.get("error"))
        self.assertNotIn("sketch1", self.source())
        self.assertNotIn("Sketch", [feature["kind"] for feature in reply["features"]])

    def test_a_finished_sketch_is_in_the_tree_and_extrudes_as_a_boss(self):
        self.start()
        self.send({"kind": "draw", "entity": "rectangle", "corner": {"point": "Origin"}, "opposite": {"at": [10, 6]}})
        left = self.send({"kind": "exit", "changed": True})
        self.assertEqual([(f["kind"], f["sketch"]["name"]) for f in left["features"] if f["kind"] == "Sketch"], [("Sketch", "Sketch1")])
        extruded = self.service.change({"file": self.file, "files": left["files"], "command": {
            "command": "extrude", "sketch": {"file": "plate.py", "line": self.sketch["line"], "name": "Sketch1"}, "inputs": {"depth": "3"}}})
        self.assertTrue(extruded["ok"], extruded.get("error"))
        self.assertIn("part += extrude(sketch1.face(), amount=3)\n    return part", self.source())
        # The box is Boss-Extrude1, on the rectangle it implies; the new boss holds Sketch1.
        boss = [f for f in extruded["features"] if f["kind"] == "Boss-Extrude"]
        self.assertEqual([f["sketch"].get("name") for f in boss], [None, "Sketch1"])
        self.assertNotIn("Sketch", [f["kind"] for f in extruded["features"]])

    def test_a_cut_from_a_sketch_on_a_face_goes_into_the_part(self):
        state = self.service.state(self.file)
        self.assertTrue(state["ok"], state.get("error"))
        # The plate's top face: the face at z = 0 the viewer would pick.
        top = {"selector": "f6", "type": "plane", "center": [0.0, 0.0, 0.0], "size": 800.0}
        self.send({"kind": "new", "plane": top, "name": "Sketch1"})
        self.assertIn("plane=part.faces()", self.source())
        self.send({"kind": "draw", "entity": "circle", "center": {"at": [0, 0]}, "radius": 3})
        left = self.send({"kind": "exit"})
        cut = self.service.change({"file": self.file, "files": left["files"], "command": {
            "command": "cut", "sketch": {"file": "plate.py", "line": self.sketch["line"]},
            "inputs": {"end": "through", "reverse": True}}})
        self.assertTrue(cut["ok"], cut.get("error"))
        self.assertIn("part -= extrude(sketch1.face(), amount=-part.bounding_box().diagonal)", self.source())
        self.assertIn("Cut-Extrude", [f["kind"] for f in cut["features"]])

    def test_a_boss_made_from_a_sketch_is_the_body_later_commands_act_on(self):
        # `part += extrude(...)` is build123d's own `+=`: the tracer must still read the joined
        # body as the part's, or no command after it finds the body.
        self.start()
        self.send({"kind": "draw", "entity": "rectangle", "corner": {"point": "Origin"}, "opposite": {"at": [10, 6]}})
        left = self.send({"kind": "exit"})
        extruded = self.service.change({"file": self.file, "files": left["files"], "command": {
            "command": "extrude", "sketch": {"file": "plate.py", "line": self.sketch["line"]}, "inputs": {"depth": "3"}}})
        self.assertTrue(extruded["ok"], extruded.get("error"))
        # The boss's top face, 10 by 6 at z = 3: a sketch on it starts from the part's origin, below.
        top = {"selector": "f1", "type": "plane", "center": [5.0, 3.0, 3.0], "size": 60.0}
        self.files = extruded["files"]
        self.sketch = None
        self.send({"kind": "new", "plane": top, "name": "Sketch2"})
        self.assertEqual(self.sketch["state"]["frame"]["origin"], [0.0, 0.0, 3.0])
        self.assertEqual(self.sketch["state"]["frame"]["x"], [1.0, 0.0, 0.0])

    def test_a_sketch_revolved_about_its_centerline_is_a_boss_revolve(self):
        self.start("Front")
        self.send({"kind": "draw", "entity": "rectangle", "corner": {"at": [5, 0]}, "opposite": {"at": [10, 4]}})
        self.send({"kind": "draw", "entity": "centerline", "start": {"point": "Origin"}, "end": {"at": [0, 10]}})
        left = self.send({"kind": "exit"})
        revolved = self.service.change({"file": self.file, "files": left["files"], "command": {
            "command": "revolve", "sketch": {"file": "plate.py", "line": self.sketch["line"], "axis": "Line5"},
            "inputs": {"angle": "360"}}})
        self.assertTrue(revolved["ok"], revolved.get("error"))
        self.assertIn("part += revolve(sketch1.face(), axis=sketch1.axis(line5), revolution_arc=360)", self.source())
        self.assertIn("Boss-Revolve", [f["kind"] for f in revolved["features"]])

    def test_an_inch_part_sketches_in_inches(self):
        root = project("""
            from build123d import Box
            from cadgen import step

            INCH = 25.4
            SIDE = 1.00

            @step
            def plate():
                part = Box(SIDE*INCH, SIDE*INCH, .25*INCH)
                return part
        """)
        self.addCleanup(shutil.rmtree, root, True)
        (root / "project.json").write_text('{"units": "in"}', encoding="utf-8")
        self.root, self.file = root, str(root / "plate.step")
        self.files = self.service.state(self.file)["files"]
        self.start()
        self.assertIn('sketch1 = Sketch("Sketch1", plane="Top", unit=INCH)', self.source())
        self.send({"kind": "draw", "entity": "circle", "center": {"point": "Origin"}, "radius": 0.2})
        self.send({"kind": "dimension", "dimension": "diameter", "refs": ["Circle1"], "value": ".25"})
        self.assertIn("sketch1.diameter(circle1, 0.25)", self.source())
        self.assertEqual(self.sketch["state"]["unit"], 25.4)


if __name__ == "__main__":
    unittest.main()
