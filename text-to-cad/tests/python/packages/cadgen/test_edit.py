"""Edit mode (``cadgen.edit``): a part script read as a design, and one number of it changed.

The tracer runs in a process of its own, as the viewer's server runs it, so these drive the edit
service end to end on a small part in a fresh folder. Builds are not started here: what a change
would build is checked through ``dependents``.
"""

from __future__ import annotations

import shutil
import tempfile
import textwrap
import unittest
from pathlib import Path

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


def project(files: dict[str, str], hidden: bool = False) -> Path:
    # Studio keeps its projects in a hidden state folder; edit mode must still read them.
    base = Path(tempfile.mkdtemp(prefix="cadgen-edit-"))
    root = base / ".studio" / "plate" if hidden else base
    root.mkdir(parents=True, exist_ok=True)
    (root / ".git").mkdir()
    for name, text in files.items():
        (root / name).write_text(textwrap.dedent(text), encoding="utf-8")
    return root


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

    def test_a_model_without_a_script_is_not_edited(self):
        self.assertEqual(self.service.state(str(self.root / "other.step"))["reason"], "no-script")
        self.assertEqual(self.service.state("relative/plate.step")["reason"], "no-script")


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
