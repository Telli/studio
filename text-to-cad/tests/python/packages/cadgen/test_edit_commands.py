"""Edit mode's modeling commands (``cadgen.edit.commands``): Fillet, Chamfer, Hole, Shell, Mirror
and Pattern, each written as one line of build123d after the statement that makes the part's
body, read back by the tracer as a feature of the history, and put back by Undo; and Delete on a
feature of the history (``cadgen.edit.deleting``), its lines taken out.

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


# A tray as an agent writes one: a base, filleted in place, a cavity cut from it into a new name,
# pads joined in a loop, and a hole.
TRAY = {
    "tray.py": """
        from build123d import Axis, Box, Cylinder, Pos, fillet
        from cadgen import step


        @step
        def tray():
            outer = Box(40, 20, 10)
            outer = fillet(outer.edges().filter_by(Axis.Z), radius=2)
            cavity = Pos(0, 0, 2) * Box(36, 16, 10)
            tray = outer - cavity
            for x in (-10, 10):
                pad = Pos(x, 0, -6) * Box(6, 6, 2)
                tray = tray + pad
            tray -= Cylinder(1, 20)
            return tray
    """,
}


# An assembly of two parts, each a model of its own beside its STEP, as a project lays them out.
ASSEMBLY = {
    "parts/base.py": """
        from build123d import Box
        from cadgen import step


        @step
        def base():
            return Box(20, 10, 4)
    """,
    "parts/pin.py": """
        from build123d import Cylinder, Pos
        from cadgen import step


        @step
        def pin():
            return Pos(0, 0, 5) * Cylinder(2, 6)
    """,
    "assemblies/stack.py": """
        import sys
        from pathlib import Path

        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "parts"))
        from build123d import Compound
        from cadgen import step
        from base import base
        from pin import pin


        @step
        def stack():
            return Compound(children=[base(), pin()], label="stack")
    """,
}


def project(files: dict[str, str]) -> Path:
    root = Path(tempfile.mkdtemp(prefix="cadgen-edit-commands-"))
    (root / ".git").mkdir()
    for name, text in files.items():
        (root / name).parent.mkdir(parents=True, exist_ok=True)
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

    def test_a_face_selected_for_a_chamfer_stands_for_its_edges(self):
        root, file, state = self.open(BLOCK, "block.step")
        reply = self.command(file, state, "chamfer", BLOCK_TOP, {"distance": "0.5"})
        self.assertTrue(reply["ok"], reply.get("error"))
        self.assertIn("    part = chamfer(part.edges().group_by(Axis.Z)[-1], length=0.5)\n", (root / "block.py").read_text(encoding="utf-8"))
        self.assertEqual(reply["change"]["what"], "4 edges")

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

    def test_a_counterbored_hole_is_its_hole_and_its_counterbore_in_one_line(self):
        root, file, state = self.open(BLOCK, "block.step")
        narrow = self.command(file, state, "hole", BLOCK_TOP, {"diameter": "2", "depth": "3", "type": "counterbore",
                                                              "cbore_diameter": "1.5", "cbore_depth": "1"})
        self.assertFalse(narrow["ok"])
        self.assertIn("wider than its hole", narrow["error"])
        reply = self.command(file, state, "hole", BLOCK_TOP, {"diameter": "2", "depth": "3", "type": "counterbore",
                                                             "cbore_diameter": "4", "cbore_depth": "1"})
        self.assertTrue(reply["ok"], reply.get("error"))
        self.assertIn("part -= Plane(part.faces().sort_by(Axis.Z)[-1]) * (Cylinder(2/2, 3, align=(Align.CENTER, Align.CENTER, Align.MAX)) "
                      "+ Cylinder(4/2, 1, align=(Align.CENTER, Align.CENTER, Align.MAX)))", (root / "block.py").read_text(encoding="utf-8"))
        hole = reply["rows"][-1]
        self.assertEqual(hole["kind"], "Hole")
        self.assertEqual([(each["label"], each["display"]) for each in hole["inputs"]],
                         [("Diameter", "2"), ("Depth", "3"), ("Counterbore Diameter", "4"), ("Counterbore Depth", "1")])
        feature = next(feature for feature in reply["features"] if feature["kind"] == "Hole")
        self.assertEqual({key: feature["edit"]["values"][key] for key in ("type", "cbore_diameter", "cbore_depth")},
                         {"type": "counterbore", "cbore_diameter": "4", "cbore_depth": "1"})

    def test_a_countersunk_hole_cones_down_to_the_hole_at_its_angle(self):
        root, file, state = self.open(BLOCK, "block.step")
        reply = self.command(file, state, "hole", BLOCK_TOP, {"diameter": "2", "depth": "3", "type": "countersink",
                                                             "csk_diameter": "4", "csk_angle": "90"})
        self.assertTrue(reply["ok"], reply.get("error"))
        # At 90 degrees the cone falls one unit for each unit it narrows.
        self.assertIn("+ Cone(2/2, 4/2, 1, align=(Align.CENTER, Align.CENTER, Align.MAX)))", (root / "block.py").read_text(encoding="utf-8"))
        hole = reply["rows"][-1]
        self.assertEqual([(each["label"], each["display"]) for each in hole["inputs"]],
                         [("Diameter", "2"), ("Depth", "3"), ("Countersink Diameter", "4")])
        feature = next(feature for feature in reply["features"] if feature["kind"] == "Hole")
        self.assertEqual({key: feature["edit"]["values"][key] for key in ("type", "csk_diameter", "csk_angle")},
                         {"type": "countersink", "csk_diameter": "4", "csk_angle": "90"})

    def test_a_shell_opens_the_selected_face(self):
        root, file, state = self.open(BLOCK, "block.step")
        reply = self.command(file, state, "shell", BLOCK_TOP, {"thickness": "1"})
        self.assertTrue(reply["ok"], reply.get("error"))
        self.assertIn("part = offset(part, amount=-1, openings=part.faces().group_by(Axis.Z)[-1])",
                      (root / "block.py").read_text(encoding="utf-8"))
        shell = reply["rows"][-1]
        self.assertEqual((shell["kind"], [(each["label"], each["display"]) for each in shell["inputs"]]), ("Shell", [("Thickness", "1")]))


# A block with its top back edge chamfered: a face slanted at 45 degrees, its normal along (0, 1, 1).
WEDGE = {
    "wedge.py": """
        from build123d import Axis, Box, chamfer
        from cadgen import step


        @step
        def wedge():
            part = Box(20, 20, 10)
            part = chamfer(part.edges().group_by(Axis.Z)[-1].sort_by(Axis.Y)[-1], length=6)
            return part
    """,
}
# The chamfer's face as the viewer reads it: from y = 4 at the top to y = 10 at z = -1.
SLANTED = {"selector": "f99", "type": "plane", "center": [0.0, 7.0, 2.0], "size": 20 * 6 * 2 ** 0.5}


class SlantedHoles(Commands):
    def test_a_hole_on_a_slanted_face_goes_where_it_is_put_on_the_face(self):
        root, file, state = self.open(WEDGE, "wedge.step")
        # Along X and down the slope, as a click there gives them, to the places the panel shows.
        reply = self.command(file, state, "hole", [SLANTED], {"diameter": "3", "x": "5", "y": "1.004", "z": "-1"})
        self.assertTrue(reply["ok"], reply.get("error"))
        text = (root / "wedge.py").read_text(encoding="utf-8")
        # Put back on the face's plane: a hair off it would leave the hole off the face.
        self.assertIn("part -= Pos(5, 1.002, -1.002) * Plane(part.faces()", text)
        hole = next(feature for feature in reply["features"] if feature["kind"] == "Hole")
        self.assertEqual(hole["edit"]["values"]["type"], "simple")
        self.assertEqual({axis: hole["edit"]["values"][axis] for axis in "xyz"}, {"x": "5", "y": "1.002", "z": "-1.002"})
        refused = self.command(file, reply, "hole", [SLANTED], {"diameter": "3", "z": "3"})
        self.assertFalse(refused["ok"])
        self.assertIn("2.12 mm off the face", refused["error"])


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


class EditingFeatures(Commands):
    """Edit Feature: a command's feature opened with its values, its own line written again."""

    def feature(self, state: dict, kind: str) -> dict:
        return next(feature for feature in state["features"] if feature["kind"] == kind)

    def edit(self, file: str, state: dict, feature: dict, inputs: dict) -> dict:
        spec = {"command": feature["edit"]["command"], "inputs": inputs, "replace": {"row": feature["key"]}}
        return self.service.change({"file": file, "command": spec, "files": state["files"]})

    def test_a_fillet_opens_with_its_radius_and_is_written_again_in_its_place(self):
        root, file, state = self.open(BLOCK, "block.step")
        made = self.command(file, state, "fillet", BLOCK_TOP_EDGES, {"radius": "1"})
        self.assertTrue(made["ok"], made.get("error"))
        script = root / "block.py"
        before = script.read_text(encoding="utf-8")
        fillet = self.feature(made, "Fillet")
        self.assertEqual(fillet["edit"], {"command": "fillet", "values": {"radius": "1"}, "keeps": "4 edges"})
        edited = self.edit(file, made, fillet, {"radius": "0.5"})
        self.assertTrue(edited["ok"], edited.get("error"))
        self.assertEqual(script.read_text(encoding="utf-8"), before.replace(", radius=1)", ", radius=0.5)"))
        self.assertTrue(edited["change"]["edited"])
        self.assertEqual([feature["kind"] for feature in edited["features"]].count("Fillet"), 1)
        undone = self.service.change({"file": file, "splice": edited["change"]["undo"], "files": edited["files"]})
        self.assertTrue(undone["ok"], undone.get("error"))
        self.assertEqual(script.read_text(encoding="utf-8"), before)

    def test_a_value_left_as_it_was_keeps_its_named_size(self):
        root, file, state = self.open(TRAY, "tray.step")
        script = root / "tray.py"
        script.write_text(script.read_text(encoding="utf-8").replace("radius=2)", "radius=WALL)").replace(
            "@step", "WALL = 2\n\n\n@step"), encoding="utf-8")
        state = self.service.state(file)
        self.assertTrue(state["ok"], state.get("error"))
        fillet = self.feature(state, "Fillet")
        self.assertEqual(fillet["edit"]["values"], {"radius": "2"})
        self.assertEqual(fillet["edit"]["keeps"], "4 edges")
        edited = self.edit(file, state, fillet, {"radius": "2"})
        self.assertTrue(edited["ok"], edited.get("error"))
        self.assertIn("outer = fillet(outer.edges().filter_by(Axis.Z), radius=WALL)\n", script.read_text(encoding="utf-8"))
        # A line no command writes opens nothing: the agent's own hole.
        self.assertNotIn("edit", self.feature(state, "Hole"))

    def test_a_hole_keeps_its_face_and_moves_on_it(self):
        root, file, state = self.open(BLOCK, "block.step")
        made = self.command(file, state, "hole", BLOCK_TOP, {"diameter": "2", "depth": "3", "x": "5"})
        self.assertTrue(made["ok"], made.get("error"))
        hole = self.feature(made, "Hole")
        self.assertEqual(hole["edit"]["values"], {"diameter": "2", "through": False, "depth": "3", "x": "5", "y": "0", "type": "simple"})
        edited = self.edit(file, made, hole, {"diameter": "3", "depth": "", "x": "5", "y": "-2"})
        self.assertTrue(edited["ok"], edited.get("error"))
        text = (root / "block.py").read_text(encoding="utf-8")
        self.assertIn("part -= Pos(5, -2) * Plane(part.faces().sort_by(Axis.Z)[-1]) * Cylinder(3/2, part.bounding_box().diagonal, "
                      "align=(Align.CENTER, Align.CENTER, Align.MAX))\n", text)
        self.assertEqual(text.count("Cylinder("), 1)

    def test_a_pattern_turns_to_another_direction_and_keeps_what_it_repeats(self):
        root, file, state = self.open(PLATE, "plate.step")
        feature = {"row": next(row for row in state["rows"] if row["kind"] == "Hole")["key"], "name": "Hole1"}
        made = self.command(file, state, "pattern", (), {"type": "linear", "direction": "X", "spacing": "-.4", "count": "3"}, feature)
        self.assertTrue(made["ok"], made.get("error"))
        pattern = self.feature(made, "Pattern")
        self.assertEqual(pattern["edit"]["values"], {"type": "linear", "direction": "X", "spacing": "0.4", "reverse": True, "count": "3"})
        self.assertEqual(pattern["edit"]["keeps"], "hole1")
        edited = self.edit(file, made, pattern, {"type": "linear", "direction": "Y", "spacing": ".3", "count": "3"})
        self.assertTrue(edited["ok"], edited.get("error"))
        text = (root / "plate.py").read_text(encoding="utf-8")
        self.assertIn("plate -= [loc * hole1 for loc in bd.GridLocations(0, .3*INCH, 1, 3, "
                      "align=(bd.Align.CENTER, bd.Align.MIN)).locations[1:]]\n", text)
        self.assertEqual(text.count("hole1 :="), 1)

    def test_a_pattern_up_z_places_each_copy_and_reads_back(self):
        root, file, state = self.open(PLATE, "plate.step")
        feature = {"row": next(row for row in state["rows"] if row["kind"] == "Hole")["key"], "name": "Hole1"}
        made = self.command(file, state, "pattern", (), {"type": "linear", "direction": "Z", "spacing": "-(.3)", "count": "3"}, feature)
        self.assertTrue(made["ok"], made.get("error"))
        text = (root / "plate.py").read_text(encoding="utf-8")
        self.assertIn("plate -= [bd.Pos(0, 0, -.3*INCH * i) * hole1 for i in range(1, 3)]\n", text)
        self.assertEqual([row["kind"] for row in made["rows"]], ["Box", "Hole", "Pattern"])
        self.assertEqual([(each["label"], each["display"]) for each in made["rows"][-1]["inputs"]], [("Spacing", "-0.3")])
        pattern = self.feature(made, "Pattern")
        self.assertEqual(pattern["edit"]["values"], {"type": "linear", "direction": "Z", "spacing": "0.3", "reverse": True, "count": "3"})
        edited = self.edit(file, made, pattern, {"type": "linear", "direction": "Z", "spacing": "-(.3)", "count": "5"})
        self.assertTrue(edited["ok"], edited.get("error"))
        self.assertIn("plate -= [bd.Pos(0, 0, -.3*INCH * i) * hole1 for i in range(1, 5)]\n", (root / "plate.py").read_text(encoding="utf-8"))

    def test_a_circular_pattern_turns_about_a_round_face_or_a_straight_edge(self):
        hub = {"hub.py": """
            from build123d import Box, Cylinder, Pos
            from cadgen import step


            @step
            def hub():
                hub = Box(40, 40, 4) + Pos(5, 5, 4) * Cylinder(4, 4)
                hub -= Pos(15, 5, 0) * Cylinder(1, 10)
                return hub
        """}
        root, file, state = self.open(hub, "hub.step")
        feature = {"row": next(row for row in state["rows"] if row["kind"] == "Hole")["key"], "name": "Hole1"}
        # The boss's side, as the viewer reads it: a bolt circle of the hole about the boss's axis.
        boss = {"selector": "f99", "type": "cylinder", "center": [5.0, 5.0, 4.0], "size": 100.530965}
        made = self.command(file, state, "pattern", [boss], {"type": "circular", "count": "6"}, feature)
        self.assertTrue(made["ok"], made.get("error"))
        text = (root / "hub.py").read_text(encoding="utf-8")
        self.assertRegex(text, r"\n    hub -= \[hole1\.rotate\(hub\.faces\(\)[^\n]*\.axis_of_rotation, i \* 360 / 6\) for i in range\(1, 6\)\]\n")
        self.assertEqual([row["kind"] for row in made["rows"]][-1], "Pattern")
        pattern = self.feature(made, "Pattern")
        self.assertEqual(pattern["edit"]["values"], {"type": "circular", "count": "6", "axis": "a round face's axis"})
        self.assertEqual(made["change"]["what"], "6 around a round face's axis")
        # Edit Feature keeps the axis as written, unless another is picked: a straight edge, the box's corner.
        more = self.edit(file, made, pattern, {"type": "circular", "count": "8"})
        self.assertTrue(more["ok"], more.get("error"))
        self.assertIn(".axis_of_rotation, i * 360 / 8) for i in range(1, 8)]", (root / "hub.py").read_text(encoding="utf-8"))
        corner = edge("e99", (20, 20, 0), 4)
        spec = {"command": "pattern", "selection": [corner], "inputs": {"type": "circular", "count": "4"},
                "replace": {"row": self.feature(more, "Pattern")["key"]}}
        about = self.service.change({"file": file, "command": spec, "files": more["files"]})
        self.assertTrue(about["ok"], about.get("error"))
        text = (root / "hub.py").read_text(encoding="utf-8")
        self.assertRegex(text, r"\n    hub -= \[hole1\.rotate\(Axis\(hub\.edges\(\)[^\n]*\), i \* 360 / 4\) for i in range\(1, 4\)\]\n")
        self.assertTrue(any(line.startswith("from build123d import") and "Axis" in line for line in text.splitlines()))
        # The boss's top: flat, so no axis to turn about.
        flat = {"selector": "f99", "type": "plane", "center": [5.0, 5.0, 6.0], "size": 50.265482}
        refused = self.command(file, about, "pattern", [flat], {"type": "circular", "count": "4"}, feature)
        self.assertFalse(refused["ok"])
        self.assertIn("round face's axis or a straight edge", refused["error"])

    def test_a_feature_of_another_kind_is_refused(self):
        root, file, state = self.open(BLOCK, "block.step")
        made = self.command(file, state, "fillet", BLOCK_TOP_EDGES, {"radius": "1"})
        fillet = self.feature(made, "Fillet")
        refused = self.service.change({"file": file, "files": made["files"], "command": {
            "command": "chamfer", "inputs": {"distance": "1"}, "replace": {"row": fillet["key"]}}})
        self.assertFalse(refused["ok"])
        self.assertIn("is a Fillet, not a Chamfer", refused["error"])


class Deleting(Commands):
    """Delete on a feature of the design tree (``cadgen.edit.deleting``)."""

    def remove(self, file: str, state: dict, kind: str, title: str, nth: int = 0) -> dict:
        key = [feature["key"] for feature in state["features"] if feature["kind"] == kind][nth]
        return self.service.change({"file": file, "remove": {"feature": key, "title": title}, "files": state["files"]})

    def test_a_feature_that_changes_the_body_in_place_is_taken_out_and_undo_puts_it_back(self):
        root, file, state = self.open(TRAY, "tray.step")
        script = root / "tray.py"
        before = script.read_bytes()
        reply = self.remove(file, state, "Hole", "Hole1")
        self.assertTrue(reply["ok"], reply.get("error"))
        self.assertNotIn("Cylinder(1, 20)", script.read_text(encoding="utf-8"))
        self.assertNotIn("Hole", [feature["kind"] for feature in reply["features"]])
        self.assertEqual((reply["change"]["kind"], reply["change"]["line"]), ("delete", 14))
        undone = self.service.change({"file": file, "splice": reply["change"]["undo"], "files": reply["files"]})
        self.assertTrue(undone["ok"], undone.get("error"))
        self.assertEqual(script.read_bytes(), before)

    def test_a_cut_that_starts_a_name_keeps_the_name_as_the_body_it_was_cut_from(self):
        root, file, state = self.open(TRAY, "tray.step")
        reply = self.remove(file, state, "Cut-Extrude", "Cut-Extrude1")
        self.assertTrue(reply["ok"], reply.get("error"))
        text = (root / "tray.py").read_text(encoding="utf-8")
        self.assertIn("    tray = outer\n", text)
        self.assertNotIn("cavity", text)

    def test_a_feature_made_in_a_loop_goes_with_its_loop(self):
        root, file, state = self.open(TRAY, "tray.step")
        reply = self.remove(file, state, "Boss-Extrude", "Boss-Extrude2", nth=1)
        self.assertTrue(reply["ok"], reply.get("error"))
        text = (root / "tray.py").read_text(encoding="utf-8")
        self.assertNotIn("for x in", text)
        self.assertNotIn("pad", text)

    def test_a_feature_whose_name_a_later_one_uses_is_refused_naming_where(self):
        root, file, state = self.open(TRAY, "tray.step")
        before = (root / "tray.py").read_bytes()
        refused = self.remove(file, state, "Boss-Extrude", "Boss-Extrude1")
        self.assertFalse(refused["ok"])
        self.assertIn("Boss-Extrude1 makes outer, which line 8 still uses", refused["error"])
        self.assertEqual(refused["dependents"], {"name": "outer", "lines": [8], "file": "tray.py"})
        self.assertEqual((root / "tray.py").read_bytes(), before)



class Suppressing(Commands):
    """Suppress and Unsuppress on a feature of the design tree (``cadgen.edit.deleting``)."""

    def suppress(self, file: str, state: dict, kind: str, title: str, on: bool = True, nth: int = 0) -> dict:
        key = [feature["key"] for feature in state["features"] if feature["kind"] == kind][nth]
        return self.service.change({"file": file, "suppress": {"feature": key, "title": title, "on": on}, "files": state["files"]})

    def test_a_suppressed_feature_stays_in_the_tree_and_comes_back_exactly(self):
        root, file, state = self.open(TRAY, "tray.step")
        script = root / "tray.py"
        before = script.read_text(encoding="utf-8")
        reply = self.suppress(file, state, "Fillet", "Fillet1")
        self.assertTrue(reply["ok"], reply.get("error"))
        self.assertIn("    outer = Box(40, 20, 10)\n    # Suppressed (Fillet, 1 line):\n"
                      "    # outer = fillet(outer.edges().filter_by(Axis.Z), radius=2)\n    cavity =", script.read_text(encoding="utf-8"))
        self.assertEqual([(feature["kind"], bool(feature.get("suppressed"))) for feature in reply["features"]][:3],
                         [("Boss-Extrude", False), ("Fillet", True), ("Cut-Extrude", False)])
        self.assertEqual((reply["change"]["kind"], reply["change"]["on"], reply["change"]["line"]), ("suppress", True, 8))
        back = self.suppress(file, reply, "Fillet", "Fillet1", on=False)
        self.assertTrue(back["ok"], back.get("error"))
        self.assertEqual(script.read_text(encoding="utf-8"), before)
        self.assertFalse(any(feature.get("suppressed") for feature in back["features"]))

    def test_a_cut_that_starts_a_name_keeps_the_name_while_suppressed(self):
        root, file, state = self.open(TRAY, "tray.step")
        script = root / "tray.py"
        before = script.read_text(encoding="utf-8")
        reply = self.suppress(file, state, "Cut-Extrude", "Cut-Extrude1")
        self.assertTrue(reply["ok"], reply.get("error"))
        self.assertIn("    # Suppressed (Cut-Extrude, 2 lines):\n    # cavity = Pos(0, 0, 2) * Box(36, 16, 10)\n"
                      "    # tray = outer - cavity\n    tray = outer  # Cut-Extrude suppressed\n", script.read_text(encoding="utf-8"))
        undone = self.service.change({"file": file, "splice": reply["change"]["undo"], "files": reply["files"]})
        self.assertTrue(undone["ok"], undone.get("error"))
        self.assertEqual(script.read_text(encoding="utf-8"), before)
        # Deleted while suppressed, it goes as Delete takes it out: the name kept as the body.
        again = self.suppress(file, undone, "Cut-Extrude", "Cut-Extrude1")
        deleted = self.service.change({"file": file, "files": again["files"], "remove": {
            "feature": next(f["key"] for f in again["features"] if f.get("suppressed")), "title": "Cut-Extrude1"}})
        self.assertTrue(deleted["ok"], deleted.get("error"))
        text = script.read_text(encoding="utf-8")
        self.assertIn("    tray = outer\n", text)
        self.assertNotIn("cavity", text)
        self.assertNotIn("Suppressed", text)

    def test_a_comment_after_a_suppressed_feature_stays_the_engineers(self):
        root, file, state = self.open(TRAY, "tray.step")
        script = root / "tray.py"
        script.write_text(script.read_text(encoding="utf-8").replace("radius=2)\n", "radius=2)\n    # x = 1\n"), encoding="utf-8")
        before = script.read_text(encoding="utf-8")
        state = self.service.state(file)
        reply = self.suppress(file, state, "Fillet", "Fillet1")
        self.assertTrue(reply["ok"], reply.get("error"))
        back = self.suppress(file, reply, "Fillet", "Fillet1", on=False)
        self.assertTrue(back["ok"], back.get("error"))
        self.assertEqual(script.read_text(encoding="utf-8"), before)

    def test_a_feature_a_later_one_uses_is_not_suppressed(self):
        root, file, state = self.open(TRAY, "tray.step")
        before = (root / "tray.py").read_bytes()
        refused = self.suppress(file, state, "Boss-Extrude", "Boss-Extrude1")
        self.assertFalse(refused["ok"])
        self.assertIn("Boss-Extrude1 makes outer, which line 8 still uses. Suppress what uses it first", refused["error"])
        self.assertEqual((root / "tray.py").read_bytes(), before)

    def test_a_new_feature_goes_after_a_suppressed_one_at_the_end(self):
        root, file, state = self.open(BLOCK, "block.step")
        made = self.command(file, state, "hole", BLOCK_TOP, {"diameter": "2", "depth": "3"})
        self.assertTrue(made["ok"], made.get("error"))
        suppressed = self.suppress(file, made, "Hole", "Hole1")
        self.assertTrue(suppressed["ok"], suppressed.get("error"))
        shelled = self.command(file, suppressed, "shell", BLOCK_TOP, {"thickness": "1"})
        self.assertTrue(shelled["ok"], shelled.get("error"))
        text = (root / "block.py").read_text(encoding="utf-8")
        self.assertLess(text.index("# Suppressed (Hole"), text.index("offset(part"))
        self.assertEqual([(f["kind"], bool(f.get("suppressed"))) for f in shelled["features"]],
                         [("Boss-Extrude", False), ("Hole", True), ("Shell", False)])



class RollingBack(Commands):
    """The rollback bar, and Edit Feature picking a feature's edges again on the body before it."""

    def test_the_bar_shows_the_body_above_a_feature_and_a_command_goes_there(self):
        root, file, state = self.open(BLOCK, "block.step")
        made = self.command(file, state, "hole", BLOCK_TOP, {"diameter": "2", "depth": "3"})
        self.assertTrue(made["ok"], made.get("error"))
        hole = next(feature for feature in made["features"] if feature["kind"] == "Hole")
        bar = {"before": f"block.py:{hole['line']}"}
        rolled = self.service.change({"file": file, "files": made["files"], "bar": bar})
        self.assertTrue(rolled["ok"], rolled.get("error"))
        self.assertEqual((rolled["bar"]["before"], rolled["bar"]["item"], rolled["bar"]["name"], rolled["bar"]["kind"]),
                         (bar["before"], hole["key"], "part", "part"))
        # The body there, as the store's tree the viewer draws: the block before its hole.
        from cadgen.store.lazy import materialize_model

        self.assertAlmostEqual(materialize_model(rolled["bar"]["tree"], label="block").volume, 20 * 10 * 4, places=3)
        filleted = self.service.change({"file": file, "files": rolled["files"], "bar": rolled["bar"], "command": {
            "command": "fillet", "selection": BLOCK_TOP_EDGES, "inputs": {"radius": "1"}}})
        self.assertTrue(filleted["ok"], filleted.get("error"))
        lines = (root / "block.py").read_text(encoding="utf-8").splitlines()
        at = next(index for index, line in enumerate(lines) if "fillet(" in line)
        self.assertIn("Cylinder(", lines[at + 1])
        self.assertEqual([feature["kind"] for feature in filleted["features"]], ["Boss-Extrude", "Fillet", "Hole"])
        # The bar stays above the hole, which moved down a line.
        self.assertEqual(filleted["bar"]["before"], f"block.py:{hole['line'] + 1}")
        forward = self.service.change({"file": file, "files": filleted["files"], "bar": None})
        self.assertIsNone(forward["bar"])

    def test_moving_the_bar_alone_does_not_run_the_part_again(self):
        root, file, state = self.open(TRAY, "tray.step")
        fillet = next(feature for feature in state["features"] if feature["kind"] == "Fillet")
        moved = self.service.change({"file": file, "files": state["files"], "bar": {"item": fillet["key"]}})
        self.assertTrue(moved["ok"], moved.get("error"))
        # Answered from the last read of the part: the bar, and nothing else to draw again.
        self.assertTrue(moved.get("unchanged"))
        self.assertNotIn("features", moved)
        self.assertEqual(moved["bar"]["item"], fillet["key"])
        # A file changed since that read is read again before the bar is placed.
        script = root / "tray.py"
        script.write_text(script.read_text(encoding="utf-8") + "\n# changed by hand\n", encoding="utf-8")
        again = self.service.change({"file": file, "files": state["files"], "bar": {"item": fillet["key"]}})
        self.assertTrue(again["ok"], again.get("error"))
        self.assertNotIn("unchanged", again)
        self.assertEqual(again["bar"]["item"], fillet["key"])

    def test_edit_feature_picks_a_fillets_edges_again_on_the_body_before_it(self):
        root, file, state = self.open(TRAY, "tray.step")
        fillet = next(feature for feature in state["features"] if feature["kind"] == "Fillet")
        # The box's four top edges, as the viewer reads them on the body before the fillet.
        top = [edge("e1", (0, -10, 5), 40), edge("e2", (0, 10, 5), 40), edge("e3", (-20, 0, 5), 20), edge("e4", (20, 0, 5), 20)]
        edited = self.service.change({"file": file, "files": state["files"], "bar": {"before": "tray.py:8"}, "bar_after": None, "command": {
            "command": "fillet", "selection": top, "inputs": {"radius": "2"}, "replace": {"row": fillet["key"]}}})
        self.assertTrue(edited["ok"], edited.get("error"))
        line = (root / "tray.py").read_text(encoding="utf-8").splitlines()[7]
        self.assertTrue(line.startswith("    outer = fillet(outer.") and line.endswith(", radius=2)"), line)
        self.assertNotIn("filter_by(Axis.Z)", line)
        self.assertIsNone(edited["bar"])
        self.assertEqual(next(f for f in edited["features"] if f["kind"] == "Fillet")["edit"]["keeps"], "4 edges")



class Assemblies(Commands):
    """An assembly places its parts: each is modeled on its own, opened from the design tree."""

    def test_each_part_names_the_model_open_part_opens_and_the_assembly_takes_no_commands(self):
        root, file, state = self.open(ASSEMBLY, "assemblies/stack.step")
        self.assertEqual([(c["name"], Path(c["step"]).parent.name, Path(c["step"]).name) for c in state["components"]],
                         [("base", "parts", "base.step"), ("pin", "parts", "pin.step")])
        refused = self.command(file, state, "fillet", BLOCK_TOP_EDGES, {"radius": "1"})
        self.assertFalse(refused["ok"])


if __name__ == "__main__":
    unittest.main()
