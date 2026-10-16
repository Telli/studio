"""The tracer on a small part: its sizes, a dimension on the model, and edits written back.

Run in cadgen's Python (it needs build123d): `python test_tracer.py`.
"""

import tempfile
import textwrap
import unittest
from pathlib import Path

import tracer


def project(files, hidden=False):
    # Studio keeps its projects in a hidden state folder; the tracer must still read them.
    root = Path(tempfile.mkdtemp(prefix="part-editor-")) / (".studio" if hidden else "")
    root.mkdir(exist_ok=True)
    for name, text in files.items():
        (root / name).write_text(textwrap.dedent(text))
    return root


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
}


class NumbersAsWritten(unittest.TestCase):
    def test_keeps_how_the_number_was_written(self):
        self.assertEqual(tracer.literal_text(0.05, ".060"), ".050")
        self.assertEqual(tracer.literal_text(3.0, "2.80"), "3.00")
        self.assertEqual(tracer.literal_text(3.125, "2.80"), "3.125")
        self.assertEqual(tracer.literal_text(12.0, "10"), "12")

    def test_reads_plain_arithmetic_only(self):
        self.assertEqual(tracer.parse_number("2.8 + .2"), 3.0)
        self.assertEqual(tracer.parse_number("-3/4"), -0.75)
        with self.assertRaises(ValueError):
            tracer.parse_number("__import__('os').getcwd()")


class TraceAndEdit(unittest.TestCase):
    def setUp(self):
        self.root = project(PLATE)
        self.request = {"script": str(self.root / "plate.py"), "root": str(self.root)}

    def test_sizes_and_dimensions(self):
        state = tracer.trace(self.request)
        self.assertTrue(state["ok"], state.get("error"))
        self.assertEqual([(p["name"], p["text"]) for p in state["params"]], [("WIDTH", "20"), ("THICKNESS", "2.50")])
        width = next(d for d in state["dimensions"] if d["formula"] == "WIDTH")
        self.assertEqual((width["name"], width["display"]), ("Length", "20"))

    def test_a_project_in_a_hidden_folder(self):
        root = project(PLATE, hidden=True)
        state = tracer.trace({"script": str(root / "plate.py"), "root": str(root)})
        self.assertEqual([p["name"] for p in state["params"]], ["WIDTH", "THICKNESS"])
        self.assertEqual(len(state["rows"]), 1)

    def test_a_size_edit_changes_one_number(self):
        state = tracer.trace(self.request)
        thickness = next(p for p in state["params"] if p["name"] == "THICKNESS")
        changed = tracer.edit({**self.request, "literal": thickness["id"], "text": "3", "files": state["files"]})
        self.assertTrue(changed["ok"], changed.get("error"))
        self.assertIn("THICKNESS = 3.00\n", (self.root / "sizes.py").read_text())
        self.assertEqual(changed["change"]["from"], "2.50")

    def test_a_dimension_edit_changes_the_size_behind_it(self):
        state = tracer.trace(self.request)
        width = next(d for d in state["dimensions"] if d["formula"] == "WIDTH")
        changed = tracer.edit({**self.request, "dimension": width["id"], "text": "25", "files": state["files"]})
        self.assertTrue(changed["ok"], changed.get("error"))
        self.assertIn("WIDTH = 25\n", (self.root / "sizes.py").read_text())

    def test_refuses_a_file_changed_since_it_was_read(self):
        state = tracer.trace(self.request)
        width = next(p for p in state["params"] if p["name"] == "WIDTH")
        sizes = self.root / "sizes.py"
        sizes.write_text(sizes.read_text().replace("WIDTH = 20", "WIDTH = 22"))
        refused = tracer.handle({**self.request, "op": "edit", "literal": width["id"], "text": "30", "files": state["files"]})
        self.assertFalse(refused["ok"])
        self.assertIn("WIDTH = 22", sizes.read_text())


if __name__ == "__main__":
    unittest.main()
