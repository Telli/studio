"""Edit mode (``cadgen.edit``): a part script read as a design, and one number of it changed.

The tracer runs in a process of its own, as the viewer's server runs it, so these drive the edit
service end to end on a small part in a fresh folder. Builds are not started here: what a change
would build is checked through ``dependents``.
"""

from __future__ import annotations

import json
import os
import shutil
import tempfile
import textwrap
import unittest
from pathlib import Path
from unittest import mock

from cadgen.edit import service as edit

PLATE = {
    "sizes.py": """
        WIDTH = 20
        THICKNESS = 2.50
    """,
    "plate.py": """
        from build123d import Box
        from cadgen import step
        from sizes import WIDTH, THICKNESS

        @step
        def plate():
            return Box(WIDTH, 10, THICKNESS)
    """,
    "bracket.py": """
        from build123d import Box
        from cadgen import step

        @step
        def bracket():
            return Box(5, 5, 5)
    """,
}


# An assembly in a folder of its own, placing parts it imports from beside it. Its module names are
# the plate's: a part another trace left loaded must not stand in for a project's own.
STACK = {
    "parts/sizes.py": """
        WIDTH = 20
    """,
    "parts/plate.py": """
        from build123d import Box
        from cadgen import step
        from sizes import WIDTH

        @step
        def plate():
            return Box(WIDTH, 10, 2)
    """,
    "parts/pin.py": """
        from build123d import Cylinder, Pos
        from cadgen import step

        @step
        def pin():
            return Pos(0, 0, 4) * Cylinder(2, 6)
    """,
    "assemblies/stack.py": """
        import sys
        from pathlib import Path

        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "parts"))
        from build123d import Compound
        from cadgen import step
        from pin import pin
        from plate import plate

        @step
        def stack():
            return Compound(children=[plate(), pin()], label="stack")
    """,
}


def project(files: dict[str, str], hidden: bool = False, git: bool = True) -> Path:
    # Studio keeps its projects in a hidden state folder; edit mode must still read them.
    base = Path(tempfile.mkdtemp(prefix="cadgen-edit-"))
    root = base / ".studio" / "plate" if hidden else base
    root.mkdir(parents=True, exist_ok=True)
    if git:
        (root / ".git").mkdir()
    for name, text in files.items():
        (root / name).parent.mkdir(parents=True, exist_ok=True)
        (root / name).write_text(textwrap.dedent(text), encoding="utf-8")
    return root


def studio_records(folder: Path, units: str) -> Path:
    """Studio's records folder, with one project listing ``folder``."""
    records = Path(tempfile.mkdtemp(prefix="cadgen-studio-"))
    (records / "stack").mkdir()
    record = {"studio": 1, "name": "Stack", "brief": {"units": units}, "folders": [{"path": str(folder)}]}
    (records / "stack" / "project.json").write_text(json.dumps(record), encoding="utf-8")
    return records


class NumbersAsWritten(unittest.TestCase):
    def test_a_new_value_is_written_the_way_the_old_one_was(self):
        # The tracer's own helpers, in its process: importing it here would patch build123d.
        service = edit.EditService(build=False)
        self.addCleanup(service.close)
        root = project(PLATE)
        self.addCleanup(shutil.rmtree, root, True)
        file = str(root / "plate.step")
        state = service.state(file)
        thickness = next(p for p in state["params"] if p["name"] == "THICKNESS")
        changed = service.change({"file": file, "literal": thickness["id"], "text": "3", "files": state["files"]})
        self.assertTrue(changed["ok"], changed.get("error"))
        self.assertIn("THICKNESS = 3.00\n", (root / "sizes.py").read_text(encoding="utf-8"))
        self.assertEqual((changed["change"]["from"], changed["change"]["to"]), ("2.50", "3.00"))


class EditService(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = edit.EditService(build=False)

    @classmethod
    def tearDownClass(cls):
        cls.service.close()

    def setUp(self):
        self.root = project(PLATE)
        self.addCleanup(shutil.rmtree, self.root, True)
        self.file = str(self.root / "plate.step")

    def test_the_part_reads_as_its_sizes_history_and_dimensions(self):
        state = self.service.state(self.file)
        self.assertTrue(state["ok"], state.get("error"))
        self.assertEqual([(p["name"], p["text"]) for p in state["params"]], [("WIDTH", "20"), ("THICKNESS", "2.50")])
        self.assertEqual([row["kind"] for row in state["rows"]], ["Box"])
        length = next(d for d in state["dimensions"] if d["formula"] == "WIDTH")
        self.assertEqual((length["name"], length["display"]), ("Length", "20"))
        self.assertIsNone(state.get("mesh"))

    def test_unchanged_files_are_not_read_again(self):
        state = self.service.state(self.file)
        self.assertTrue(self.service.state(self.file, state["files"])["unchanged"])
        (self.root / "sizes.py").write_text("WIDTH = 22\nTHICKNESS = 2.50\n", encoding="utf-8")
        self.assertNotIn("unchanged", self.service.state(self.file, state["files"]))

    def test_a_dimension_changes_the_size_behind_it(self):
        state = self.service.state(self.file)
        length = next(d for d in state["dimensions"] if d["formula"] == "WIDTH")
        changed = self.service.change({"file": self.file, "dimension": length["id"], "text": "25", "files": state["files"]})
        self.assertTrue(changed["ok"], changed.get("error"))
        self.assertIn("WIDTH = 25\n", (self.root / "sizes.py").read_text(encoding="utf-8"))

    def test_a_change_is_undone_by_writing_its_number_back(self):
        state = self.service.state(self.file)
        width = next(p for p in state["params"] if p["name"] == "WIDTH")
        changed = self.service.change({"file": self.file, "literal": width["id"], "text": "24", "files": state["files"]})
        undone = self.service.change({"file": self.file, "literal": changed["change"]["literal"], "text": changed["change"]["from"],
                                      "files": changed["files"]})
        self.assertTrue(undone["ok"], undone.get("error"))
        self.assertIn("WIDTH = 20\n", (self.root / "sizes.py").read_text(encoding="utf-8"))

    def test_a_file_changed_since_it_was_read_is_refused(self):
        state = self.service.state(self.file)
        width = next(p for p in state["params"] if p["name"] == "WIDTH")
        sizes = self.root / "sizes.py"
        sizes.write_text(sizes.read_text(encoding="utf-8").replace("WIDTH = 20", "WIDTH = 22"), encoding="utf-8")
        refused = self.service.change({"file": self.file, "literal": width["id"], "text": "30", "files": state["files"]})
        self.assertFalse(refused["ok"])
        self.assertIn("WIDTH = 22", sizes.read_text(encoding="utf-8"))

    def test_a_project_in_a_hidden_folder(self):
        root = project(PLATE, hidden=True)
        self.addCleanup(shutil.rmtree, root.parent.parent, True)
        state = self.service.state(str(root / "plate.py"))
        self.assertEqual([p["name"] for p in state["params"]], ["WIDTH", "THICKNESS"])

    def test_a_folder_a_studio_project_lists_is_where_the_project_starts(self):
        # A copy, or a folder added from elsewhere, has no git repository of its own.
        root = project(STACK, hidden=True, git=False)
        self.addCleanup(shutil.rmtree, root.parent.parent, True)
        records = studio_records(root, "in")
        self.addCleanup(shutil.rmtree, records, True)
        with mock.patch.dict(os.environ, {"STUDIO_PROJECTS_DIR": str(records)}):
            state = self.service.state(str(root / "assemblies" / "stack.step"))
        self.assertTrue(state["ok"], state.get("error"))
        self.assertEqual(Path(state["root"]), root.resolve())
        self.assertEqual([c["name"] for c in state["components"]], ["plate", "pin"])
        self.assertIn("WIDTH", [p["name"] for p in state["params"]])
        # The project's brief names its units; a part read on its own would guess millimetres.
        self.assertEqual(state["units"], "in")

    def test_a_model_built_outside_the_folder_read_says_why(self):
        root = project(STACK, hidden=True, git=False)
        self.addCleanup(shutil.rmtree, root.parent.parent, True)
        with mock.patch.dict(os.environ, {"STUDIO_PROJECTS_DIR": str(root / "no-records")}):
            state = self.service.state(str(root / "assemblies" / "stack.step"))
        self.assertFalse(state["ok"])
        self.assertEqual(state["reason"], "outside")
        self.assertIn("read only the assemblies folder", state["error"])
        self.assertIn("built in the parts folder", state["error"])

    def test_a_model_without_a_script_is_not_edited(self):
        self.assertEqual(self.service.state(str(self.root / "other.step"))["reason"], "no-script")
        self.assertEqual(self.service.state("relative/plate.step")["reason"], "no-script")


TRAY = {
    "tray.py": """
        from build123d import Axis, Pos, Rectangle, RectangleRounded, extrude, fillet
        from cadgen import step

        LENGTH = 70
        WIDTH = 26
        WALL = 1.5
        FLOOR = 1.5
        HEIGHT = 12

        @step
        def tray():
            outer = extrude(RectangleRounded(LENGTH, WIDTH, 6), amount=HEIGHT)
            outer = fillet(outer.edges().group_by(Axis.Z)[0], radius=0.6)
            cavity = Pos(0, 0, FLOOR) * extrude(Rectangle(LENGTH - 2*WALL, WIDTH - 2*WALL), amount=HEIGHT)
            return outer - cavity
    """,
}


# A part whose fillet is one statement written over several lines, as an agent often writes one.
SPREAD = {
    "spread.py": """
        from build123d import Axis, Box, Cylinder, Pos, fillet
        from cadgen import step

        @step
        def spread():
            base = Box(40, 20, 5)
            base = fillet(
                base.edges().filter_by(Axis.Z),
                radius=2,
            )

            base -= Pos(10, 0) * Cylinder(1.6, 5)
            return base
    """,
}


class FeatureTree(unittest.TestCase):
    def test_the_history_reads_as_a_cad_tree_with_sketches_under_their_features(self):
        service = edit.EditService(build=False)
        self.addCleanup(service.close)
        root = project(TRAY)
        self.addCleanup(shutil.rmtree, root, True)
        state = service.state(str(root / "tray.step"))
        self.assertTrue(state["ok"], state.get("error"))
        features = state["features"]
        # The cavity's extrude and the line that cuts it are one Cut-Extrude, its rectangle its sketch.
        self.assertEqual([(f["kind"], f["name"]) for f in features],
                         [("Boss-Extrude", "outer"), ("Fillet", "outer"), ("Cut-Extrude", "cavity")])
        self.assertEqual((features[0]["sketch"]["op"], features[0]["sketch"]["plane"]), ("RectangleRounded", "Top"))
        self.assertEqual(features[2]["sketch"]["op"], "Rectangle")
        self.assertEqual(len(features[2]["rows"]), 2)
        self.assertIsNone(features[1]["sketch"])
        (x0, y0, z0), (x1, y1, z1) = state["bounds"]
        self.assertAlmostEqual(x1 - x0, 70, places=3)
        self.assertAlmostEqual(z1 - z0, 12, places=3)

    def test_each_feature_carries_the_last_line_of_its_statement(self):
        service = edit.EditService(build=False)
        self.addCleanup(service.close)
        root = project(SPREAD)
        self.addCleanup(shutil.rmtree, root, True)
        state = service.state(str(root / "spread.step"))
        self.assertTrue(state["ok"], state.get("error"))
        lines = [line.strip() for line in (root / "spread.py").read_text(encoding="utf-8").splitlines()]
        self.assertEqual([lines[at - 1] for at in (7, 8, 11, 13)],
                         ["base = Box(40, 20, 5)", "base = fillet(", ")", "base -= Pos(10, 0) * Cylinder(1.6, 5)"])
        # The fillet is written over four lines: its statement ends at the bracket that closes it. A line
        # anywhere in it is the fillet's, and the blank line after it is no feature's.
        self.assertEqual([(f["kind"], f["line"], f["end"]) for f in state["features"]],
                         [("Boss-Extrude", 7, 7), ("Fillet", 8, 11), ("Hole", 13, 13)])


SKETCHED = {
    "bracket.py": """
        from build123d import extrude
        from cadgen import step
        from cadgen.sketch import Sketch

        LENGTH = 40
        WIDTH = 20
        HOLE = 6
        THICKNESS = 4

        @step
        def bracket():
            s = Sketch("Sketch1", plane="Top")
            bottom, right, top, left = s.rectangle((0, 0), (40, 20))
            s.coincident(bottom.start, s.origin)
            s.length(bottom, LENGTH)
            s.length(left, WIDTH)
            hole = s.circle((20, 10), 3)
            s.diameter(hole, HOLE)
            s.horizontal_distance(bottom.start, hole.center, LENGTH / 2)
            s.vertical_distance(bottom.start, hole.center, WIDTH / 2)
            return extrude(s.face(), amount=THICKNESS)
    """,
}


class ConstrainedSketches(unittest.TestCase):
    def test_a_sketch_sits_under_its_feature_and_its_dimensions_are_the_features_inputs(self):
        service = edit.EditService(build=False)
        self.addCleanup(service.close)
        root = project(SKETCHED)
        self.addCleanup(shutil.rmtree, root, True)
        file = str(root / "bracket.step")
        state = service.state(file)
        self.assertTrue(state["ok"], state.get("error"))
        (feature,) = state["features"]
        self.assertEqual(feature["kind"], "Boss-Extrude")
        self.assertEqual({key: feature["sketch"][key] for key in ("name", "plane", "status")},
                         {"name": "Sketch1", "plane": "Top", "status": "Fully defined"})
        row = next(row for row in state["rows"] if row["key"] == feature["key"])
        labels = [item["label"] for item in row["inputs"]]
        self.assertIn("D1@Sketch1", labels)
        length = labels.index("D1@Sketch1")
        changed = service.change({"file": file, "input": {"row": row["key"], "index": length}, "text": "50", "files": state["files"]})
        self.assertTrue(changed["ok"], changed.get("error"))
        self.assertIn("LENGTH = 50\n", (root / "bracket.py").read_text(encoding="utf-8"))


# A tray whose fillet cannot be made once WALL is big enough: rounded in the part's own line, by a
# helper's function the part calls, and at the bottom of a chain of helper calls longer than a failure tells of.
ROUNDED = {
    "tray.py": """
        from build123d import Axis, Box, fillet
        from cadgen import step

        WALL = 2


        @step
        def tray():
            outer = Box(40, 20, 10)
            outer = fillet(outer.edges().filter_by(Axis.Z), radius=WALL)
            return outer
    """,
    "helped.py": """
        from build123d import Box
        from cadgen import step
        from helpers import rounded

        WALL = 2


        @step
        def helped():
            outer = Box(40, 20, 10)
            outer = rounded(outer, WALL)
            return outer
    """,
    "deep.py": """
        from build123d import Box
        from cadgen import step
        from helpers import descend

        WALL = 2


        @step
        def deep():
            outer = Box(40, 20, 10)
            outer = descend(outer, WALL, 9)
            return outer
    """,
    "helpers.py": """
        from build123d import Axis, fillet


        def rounded(shape, radius):
            return fillet(shape.edges().filter_by(Axis.Z), radius=radius)


        def descend(shape, radius, depth):
            if depth == 0:
                return rounded(shape, radius)
            return descend(shape, radius, depth - 1)
    """,
}


class FailedBuild(unittest.TestCase):
    """A part whose script stops says where it stopped: the frames of its traceback in its own files, so
    the viewer can tell which row of the last good part held that very line, or made the call that did. A
    row of the history reads its line the same way."""

    def setUp(self):
        self.service = edit.EditService(build=False)
        self.addCleanup(self.service.close)
        self.root = project(ROUNDED)
        self.addCleanup(shutil.rmtree, self.root, True)

    def line_of(self, name: str, text: str) -> int:
        """The line of a file that reads ``text``, counted from 1 as a traceback counts them."""
        return [line.strip() for line in (self.root / name).read_text(encoding="utf-8").splitlines()].index(text) + 1

    def too_big(self, step: str):
        file = str(self.root / f"{step}.step")
        good = self.service.state(file)
        self.assertTrue(good["ok"], good.get("error"))
        wall = next(param for param in good["params"] if param["name"] == "WALL")
        return good, self.service.change({"file": file, "literal": wall["id"], "text": "50", "files": good["files"]})

    def test_a_failed_trace_says_the_line_it_stopped_at(self):
        good, bad = self.too_big("tray")
        self.assertFalse(bad["ok"])
        self.assertIn("ValueError", bad["error"])
        # The frames of the traceback in the project's own files (build123d's and the tracer's are not),
        # deepest first, each as a row names its place: here the part's own line, and no other.
        rounding = "outer = fillet(outer.edges().filter_by(Axis.Z), radius=WALL)"
        frames = [{"file": "tray.py", "line": self.line_of("tray.py", rounding), "text": rounding}]
        self.assertEqual(bad["failure"], {"frames": frames})
        # Its text is the row's own, so the row of the last good part that held this line can be told by it.
        fillet = next(row for row in good["rows"] if row["kind"] == "Fillet")
        self.assertEqual((fillet["file"], fillet["line"], fillet["code"]), tuple(frames[0].values()))

    def test_a_helper_that_stops_gives_its_line_and_then_the_call_the_feature_stands_at(self):
        good, bad = self.too_big("helped")
        self.assertFalse(bad["ok"])
        raising = "return fillet(shape.edges().filter_by(Axis.Z), radius=radius)"
        call = "outer = rounded(outer, WALL)"
        frames = [{"file": "helpers.py", "line": self.line_of("helpers.py", raising), "text": raising},
                  {"file": "helped.py", "line": self.line_of("helped.py", call), "text": call}]
        self.assertEqual(bad["failure"], {"frames": frames})
        # The helper's line makes no row of the history; the call that made the fillet is the row.
        fillet = next(row for row in good["rows"] if row["kind"] == "Fillet")
        self.assertEqual((fillet["file"], fillet["line"], fillet["code"]), tuple(frames[1].values()))
        self.assertNotIn(("helpers.py", frames[0]["line"]), [(row["file"], row["line"]) for row in good["rows"]])

    def test_a_chain_of_helpers_longer_than_six_tells_of_the_deepest_six(self):
        _, bad = self.too_big("deep")
        self.assertFalse(bad["ok"])
        frames = bad["failure"]["frames"]
        self.assertEqual(len(frames), 6)
        # The line that raised first, then each call outwards; the part's own call is past the cap.
        self.assertEqual([frame["file"] for frame in frames], ["helpers.py"] * 6)
        self.assertEqual([frame["text"] for frame in frames],
                         ["return fillet(shape.edges().filter_by(Axis.Z), radius=radius)", "return rounded(shape, radius)"]
                         + ["return descend(shape, radius, depth - 1)"] * 4)

    def test_a_script_that_cannot_be_read_names_no_line(self):
        (self.root / "tray.py").write_text("from cadgen import step\n\n\n@step\ndef tray(:\n    pass\n", encoding="utf-8")
        bad = self.service.state(str(self.root / "tray.step"))
        self.assertFalse(bad["ok"])
        # The traceback names the script's line, but no frame of the part ran, so no place is named.
        self.assertIsNone(bad.get("failure"))

    def test_a_good_part_has_no_failure_and_each_feature_carries_its_first_line(self):
        state = self.service.state(str(self.root / "tray.step"))
        self.assertTrue(state["ok"], state.get("error"))
        self.assertNotIn("failure", state)
        lines = (self.root / "tray.py").read_text(encoding="utf-8").splitlines()
        self.assertEqual([(f["kind"], f["text"]) for f in state["features"]],
                         [(f["kind"], lines[f["line"] - 1].strip()) for f in state["features"]])
        self.assertEqual([f["text"] for f in state["features"]],
                         ["outer = Box(40, 20, 10)", "outer = fillet(outer.edges().filter_by(Axis.Z), radius=WALL)"])


class WhatAChangeBuilds(unittest.TestCase):
    def test_the_parts_that_use_the_changed_file(self):
        root = project(PLATE)
        self.addCleanup(shutil.rmtree, root, True)
        self.assertEqual([path.name for path in edit.dependents(root, "sizes.py")], ["plate.py"])
        self.assertEqual([path.name for path in edit.dependents(root, "bracket.py")], ["bracket.py"])


class TypedValues(unittest.TestCase):
    def test_plain_arithmetic_only(self):
        service = edit.EditService(build=False)
        self.addCleanup(service.close)
        root = project(PLATE)
        self.addCleanup(shutil.rmtree, root, True)
        file = str(root / "plate.step")
        state = service.state(file)
        width = next(p for p in state["params"] if p["name"] == "WIDTH")
        refused = service.change({"file": file, "literal": width["id"], "text": "__import__('os').getcwd()", "files": state["files"]})
        self.assertFalse(refused["ok"])
        changed = service.change({"file": file, "literal": width["id"], "text": "20 + 1.5", "files": state["files"]})
        self.assertTrue(changed["ok"], changed.get("error"))
        self.assertIn("WIDTH = 21.5\n", (root / "sizes.py").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
