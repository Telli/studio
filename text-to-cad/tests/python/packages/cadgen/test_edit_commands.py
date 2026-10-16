"""Edit mode's modeling commands (``cadgen.edit.commands``): Fillet, Chamfer, Hole, Shell, Mirror
and Pattern, each written as one line of build123d after the statement that makes the part's
body, read back by the tracer as a feature of the history, and put back by Undo.

They drive the edit service end to end, as the viewer's server does, on small parts in fresh
folders. A selection is what the viewer sends: each face's or edge's selector with the geometry
the viewer read of it (its kind, centre, and length or area). The selectors' numbers here need not
be the STEP's: the geometry decides, as it does when a part rebuilt with its faces in another
order. Builds are not started.
"""

from __future__ import annotations

import shutil
import tempfile
import textwrap
import unittest
from pathlib import Path

from cadgen.edit import service as edit

# A 20 x 10 x 4 block centred on the origin, returned outright, its sizes named in another file
# and build123d imported by name.
BLOCK = {
    "sizes.py": """
        WIDTH = 20
        DEPTH = 10
        HEIGHT = 4
    """,
    "block.py": """
        from build123d import Box
        from cadgen import step
        from sizes import WIDTH, DEPTH, HEIGHT

        @step
        def block():
            return Box(WIDTH, DEPTH, HEIGHT)
    """,
}

# An inch plate with a hole in it, held in a name, build123d reached through `bd`.
PLATE = {
    "plate.py": """
        from cadgen import build123d as bd, step

        INCH = 25.4
        LENGTH = 2.00
        WIDTH = 1.00
        THICKNESS = .25


        @step
        def plate():
            plate = bd.Box(LENGTH*INCH, WIDTH*INCH, THICKNESS*INCH)
            plate -= bd.Pos(.5*INCH, 0, 0) * bd.Cylinder(.1*INCH, THICKNESS*INCH)
            plate.label = "plate"
            return plate
    """,
}


def project(files: dict[str, str]) -> Path:
    root = Path(tempfile.mkdtemp(prefix="cadgen-edit-commands-"))
    (root / ".git").mkdir()
    for name, text in files.items():
        (root / name).write_text(textwrap.dedent(text).lstrip(), encoding="utf-8")
    return root


def edge(selector: str, center: tuple[float, float, float], length: float, kind: str = "line") -> dict:
    return {"selector": selector, "type": kind, "center": list(center), "size": length}


def face(selector: str, center: tuple[float, float, float], area: float) -> dict:
    return {"selector": selector, "type": "plane", "center": list(center), "size": area}


# The block's top edges and top face, as the viewer reads them.
BLOCK_TOP_EDGES = [edge("e1", (0, -5, 2), 20), edge("e2", (0, 5, 2), 20), edge("e3", (-10, 0, 2), 10), edge("e4", (10, 0, 2), 10)]
BLOCK_TOP = [face("f1", (0, 0, 2), 200)]


class Commands(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = edit.EditService(build=False)

    @classmethod
    def tearDownClass(cls):
        cls.service.close()

    def open(self, files: dict[str, str], step: str):
        root = project(files)
        self.addCleanup(shutil.rmtree, root, True)
        file = str(root / step)
        state = self.service.state(file)
        self.assertTrue(state["ok"], state.get("error"))
        return root, file, state

    def command(self, file: str, state: dict, command: str, selection=(), inputs=None, feature=None):
        spec = {"command": command, "selection": list(selection), "inputs": inputs or {}}
        if feature:
            spec["feature"] = feature
        return self.service.change({"file": file, "command": spec, "files": state["files"]})


class BlockCommands(Commands):
    def test_a_fillet_on_selected_edges_is_one_line_read_back_as_a_fillet(self):
        root, file, state = self.open(BLOCK, "block.step")
        reply = self.command(file, state, "fillet", BLOCK_TOP_EDGES, {"radius": "1"})
        self.assertTrue(reply["ok"], reply.get("error"))
        text = (root / "block.py").read_text(encoding="utf-8")
        # The returned body is held in a name, the fillet written after it, and the names it uses
        # imported; the edges are written by where they are (the top ones), not their numbers.
        self.assertIn("from build123d import Box, Axis, fillet\n", text)
        self.assertIn("    part = Box(WIDTH, DEPTH, HEIGHT)\n"
                      "    part = fillet(part.edges().group_by(Axis.Z)[-1], radius=1)\n"
                      "    return part\n", text)
        fillet = reply["rows"][-1]
        self.assertEqual((fillet["kind"], fillet["key"]), ("Fillet", reply["change"]["row"]))
        self.assertEqual([(each["label"], each["display"], each["unit"]) for each in fillet["inputs"]], [("Radius", "1", "mm")])
        self.assertEqual((reply["change"]["feature"], reply["change"]["what"]), ("Fillet", "4 edges"))

    def test_undo_puts_the_file_back_and_redo_writes_it_again(self):
        root, file, state = self.open(BLOCK, "block.step")
        script = root / "block.py"
        before = script.read_bytes()
        made = self.command(file, state, "chamfer", BLOCK_TOP_EDGES[:1], {"distance": ".5"})
        self.assertTrue(made["ok"], made.get("error"))
        after = script.read_bytes()
        undone = self.service.change({"file": file, "splice": made["change"]["undo"], "files": made["files"]})
        self.assertTrue(undone["ok"], undone.get("error"))
        self.assertEqual(script.read_bytes(), before)
        self.assertEqual([row["kind"] for row in undone["rows"]], ["Box"])
        redone = self.service.change({"file": file, "splice": made["change"]["redo"], "files": undone["files"]})
        self.assertTrue(redone["ok"], redone.get("error"))
        self.assertEqual(script.read_bytes(), after)

    def test_every_edge_named_by_its_number_alone(self):
        root, file, state = self.open(BLOCK, "block.step")
        reply = self.command(file, state, "chamfer", [{"selector": f"e{n}"} for n in range(1, 13)], {"distance": "0.5"})
        self.assertTrue(reply["ok"], reply.get("error"))
        self.assertIn("    part = chamfer(part.edges(), length=0.5)\n", (root / "block.py").read_text(encoding="utf-8"))
        self.assertEqual(reply["rows"][-1]["inputs"][0]["label"], "Distance")

    def test_a_line_that_does_not_run_is_not_written(self):
        root, file, state = self.open(BLOCK, "block.step")
        before = (root / "block.py").read_bytes()
        refused = self.command(file, state, "fillet", BLOCK_TOP_EDGES, {"radius": "6"})
        self.assertFalse(refused["ok"])
        self.assertIn("smaller radius", refused["error"])
        self.assertEqual((root / "block.py").read_bytes(), before)

    def test_a_selection_that_is_not_on_the_part_is_refused(self):
        root, file, state = self.open(BLOCK, "block.step")
        refused = self.command(file, state, "fillet", [edge("e3", (100, 100, 100), 10)], {"radius": "1"})
        self.assertFalse(refused["ok"])
        self.assertIn("not on the part", refused["error"])
        self.assertNotIn("fillet", (root / "block.py").read_text(encoding="utf-8"))

    def test_a_hole_goes_where_it_is_set_on_the_face(self):
        root, file, state = self.open(BLOCK, "block.step")
        off = self.command(file, state, "hole", BLOCK_TOP, {"diameter": "2", "depth": "3", "x": "30"})
        self.assertFalse(off["ok"])
        self.assertIn("off that face", off["error"])
        reply = self.command(file, state, "hole", BLOCK_TOP, {"diameter": "2", "depth": "3", "x": "5"})
        self.assertTrue(reply["ok"], reply.get("error"))
        self.assertIn("part -= Pos(5, 0) * Plane(part.faces().sort_by(Axis.Z)[-1]) * Cylinder(2/2, 3, "
                      "align=(Align.CENTER, Align.CENTER, Align.MAX))", (root / "block.py").read_text(encoding="utf-8"))
        hole = reply["rows"][-1]
        self.assertEqual(hole["kind"], "Hole")
        self.assertEqual([(each["label"], each["display"]) for each in hole["inputs"]], [("Diameter", "2"), ("Depth", "3"), ("X", "5")])

    def test_a_shell_opens_the_selected_face(self):
        root, file, state = self.open(BLOCK, "block.step")
        reply = self.command(file, state, "shell", BLOCK_TOP, {"thickness": "1"})
        self.assertTrue(reply["ok"], reply.get("error"))
        self.assertIn("part = offset(part, amount=-1, openings=part.faces().group_by(Axis.Z)[-1])",
                      (root / "block.py").read_text(encoding="utf-8"))
        shell = reply["rows"][-1]
        self.assertEqual((shell["kind"], [(each["label"], each["display"]) for each in shell["inputs"]]), ("Shell", [("Thickness", "1")]))


class PlateCommands(Commands):
    def hole_row(self, state):
        return next(row for row in state["rows"] if row["kind"] == "Hole")

    def test_a_fillet_in_an_inch_part_is_written_in_inches(self):
        root, file, state = self.open(PLATE, "plate.step")
        half_length, half_width, top = 25.4, 12.7, 3.175
        edges = [edge("e1", (0, -half_width, top), 50.8), edge("e2", (0, half_width, top), 50.8),
                 edge("e3", (-half_length, 0, top), 25.4), edge("e4", (half_length, 0, top), 25.4)]
        reply = self.command(file, state, "fillet", edges, {"radius": ".05"})
        self.assertTrue(reply["ok"], reply.get("error"))
        text = (root / "plate.py").read_text(encoding="utf-8")
        line = next(line.strip() for line in text.splitlines() if "bd.fillet(" in line)
        self.assertTrue(line.startswith("plate = bd.fillet(plate.") and line.endswith(", radius=.05*INCH)"), line)
        # Written before the label is set, so the body keeps it.
        self.assertLess(text.index("bd.fillet("), text.index("plate.label"))
        fillet = reply["rows"][-1]
        self.assertEqual([(each["label"], each["display"], each["unit"]) for each in fillet["inputs"]], [("Radius", "0.05", "in")])

    def test_a_pattern_of_a_hole_names_the_hole_and_repeats_it(self):
        root, file, state = self.open(PLATE, "plate.step")
        feature = {"row": self.hole_row(state)["key"], "name": "Hole1"}
        reply = self.command(file, state, "pattern", (), {"type": "linear", "direction": "X", "spacing": "-.4", "count": "3"}, feature)
        self.assertTrue(reply["ok"], reply.get("error"))
        text = (root / "plate.py").read_text(encoding="utf-8")
        self.assertIn("plate -= (hole1 := bd.Pos(.5*INCH, 0, 0) * bd.Cylinder(.1*INCH, THICKNESS*INCH))\n", text)
        self.assertIn("plate -= [loc * hole1 for loc in bd.GridLocations(-.4*INCH, 0, 3, 1, "
                      "align=(bd.Align.MIN, bd.Align.CENTER)).locations[1:]]\n", text)
        self.assertEqual([row["kind"] for row in reply["rows"]], ["Box", "Hole", "Pattern"])
        pattern = reply["rows"][-1]
        self.assertEqual([(each["label"], each["display"]) for each in pattern["inputs"]], [("Spacing", "-0.4"), ("Instances", "3")])
        # The new feature's inputs change as any feature's do: a number in its line.
        more = self.service.change({"file": file, "input": {"row": pattern["key"], "index": 1}, "text": "4", "files": reply["files"]})
        self.assertTrue(more["ok"], more.get("error"))
        self.assertIn("GridLocations(-.4*INCH, 0, 4, 1,", (root / "plate.py").read_text(encoding="utf-8"))

    def test_a_mirror_of_a_feature_about_a_plane(self):
        root, file, state = self.open(PLATE, "plate.step")
        feature = {"row": self.hole_row(state)["key"], "name": "Hole1"}
        reply = self.command(file, state, "mirror", (), {"plane": "YZ"}, feature)
        self.assertTrue(reply["ok"], reply.get("error"))
        text = (root / "plate.py").read_text(encoding="utf-8")
        self.assertIn("plate -= (hole1 := bd.Pos(.5*INCH, 0, 0) * bd.Cylinder(.1*INCH, THICKNESS*INCH))\n", text)
        self.assertIn("plate -= bd.mirror(hole1, about=bd.Plane.YZ)\n", text)
        self.assertEqual([row["kind"] for row in reply["rows"]], ["Box", "Hole", "Mirror"])

    def test_a_command_on_a_file_changed_since_it_was_read_is_refused(self):
        root, file, state = self.open(PLATE, "plate.step")
        script = root / "plate.py"
        script.write_text(script.read_text(encoding="utf-8").replace("LENGTH = 2.00", "LENGTH = 2.10"), encoding="utf-8")
        refused = self.command(file, state, "mirror", (), {"plane": "XZ"})
        self.assertFalse(refused["ok"])
        self.assertIn("changed since", refused["error"])
        self.assertNotIn("mirror", script.read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
