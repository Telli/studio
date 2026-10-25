"""Who made each feature of a part (``cadgen.edit.authors``): yours when a hand edit wrote the
first line of its statement, the agent's when a turn's checkpoint made since Studio began keeping
track holds it, and nobody's otherwise: a line from before then, and one no checkpoint holds yet.

They drive the edit service end to end, as the viewer's server does, on a small part in a fresh git
repository a Studio chat has run in. A checkpoint is made as Studio's server makes one: the folder
staged in an index of its own, committed and kept under a hidden ref, the branch left where it is.
Builds are not started.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import tempfile
import textwrap
import time
import unittest
from pathlib import Path
from unittest import mock

from cadgen.edit import authors
from cadgen.edit import service as edit

GIT_ENV = {
    "GIT_AUTHOR_NAME": "T3 Code",
    "GIT_AUTHOR_EMAIL": "t3@example.com",
    "GIT_COMMITTER_NAME": "T3 Code",
    "GIT_COMMITTER_EMAIL": "t3@example.com",
}
# A turn that ended long before Studio began keeping track.
LONG_AGO = "@1700000000 +0000"

# A block the agent made before Studio kept track, its body returned outright.
BLOCK = """
    from build123d import Box
    from cadgen import step


    @step
    def block():
        return Box(20, 10, 4)
"""
# The same block after a turn of the agent's: its top edges chamfered.
CHAMFERED = """
    from build123d import Axis, Box, chamfer
    from cadgen import step


    @step
    def block():
        part = Box(20, 10, 4)
        part = chamfer(part.edges().group_by(Axis.Z)[-1], length=0.5)
        return part
"""
BOX, BOX_HELD = "return Box(20, 10, 4)", "part = Box(20, 10, 4)"
AGENT_CHAMFER = "part = chamfer(part.edges().group_by(Axis.Z)[-1], length=0.5)"
# The block's top edges, as the viewer reads them.
TOP_EDGES = [{"selector": selector, "type": "line", "center": list(center), "size": size}
             for selector, center, size in (("e1", (0, -5, 2), 20), ("e2", (0, 5, 2), 20), ("e3", (-10, 0, 2), 10), ("e4", (10, 0, 2), 10))]


def git(repo: Path, *args: str, env: dict | None = None) -> str:
    ran = subprocess.run(["git", *args], cwd=repo, capture_output=True, text=True, check=True, env={**os.environ, **GIT_ENV, **(env or {})})
    return ran.stdout.strip()


def checkpoint(repo: Path, ordinal: int, when: str | None = None, scope: str = "t") -> str:
    """A chat's checkpoint, as Studio's server makes one at the end of each turn, and as its first
    run starts (ordinal 0)."""
    index = repo / ".git" / "checkpoint-index"
    staged = {"GIT_INDEX_FILE": str(index)}
    git(repo, "add", "-A", env=staged)
    tree = git(repo, "write-tree", env=staged)
    index.unlink()
    ref = f"refs/t3/orchestration-v2/checkpoints/{scope}/ordinal/{ordinal}"
    dated = {"GIT_COMMITTER_DATE": when, "GIT_AUTHOR_DATE": when} if when else {}
    commit = git(repo, "commit-tree", tree, "-m", f"t3 checkpoint ref={ref}", env=dated)
    git(repo, "update-ref", ref, commit)
    return commit


def made_by(reply: dict) -> dict[str, str]:
    """Who made each feature, by the first line of its statement."""
    text = {feature["key"]: feature["text"] for feature in reply["features"]}
    return {text[key]: author for key, author in reply["authors"].items()}


def key_of(reply: dict, line: str) -> str:
    return next(feature["key"] for feature in reply["features"] if feature["text"] == line)


class Authors(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.service = edit.EditService(build=False)

    @classmethod
    def tearDownClass(cls):
        cls.service.close()

    def project(self, *, repository: bool = True, chat: bool = True) -> tuple[Path, str]:
        """The block in a fresh folder: a git repository a chat has run in (its first run's checkpoint), unless not."""
        root = Path(tempfile.mkdtemp(prefix="cadgen-edit-authors-")).resolve()
        self.addCleanup(shutil.rmtree, root, True)
        if repository:
            git(root, "init", "-q")
        self.write(root, BLOCK)
        if repository and chat:
            checkpoint(root, 0)
        return root, str(root / "block.step")

    @staticmethod
    def write(root: Path, text: str) -> None:
        (root / "block.py").write_text(textwrap.dedent(text).lstrip(), encoding="utf-8")

    def read(self, file: str, files: dict | None = None) -> dict:
        reply = self.service.state(file, files)
        self.assertTrue(reply["ok"], reply.get("error"))
        return reply

    def change(self, file: str, state: dict, **change) -> dict:
        reply = self.service.change({"file": file, "files": state["files"], **change})
        self.assertTrue(reply["ok"], reply.get("error"))
        return reply

    def fillet(self, file: str, state: dict) -> dict:
        return self.change(file, state, command={"command": "fillet", "selection": TOP_EDGES, "inputs": {"radius": "1"}})

    def test_marks_nothing_from_before_tracking_began(self):
        root, file = self.project()
        checkpoint(root, 1, LONG_AGO)
        state = self.read(file)
        self.assertEqual(state["authors"], {})
        # Recording began with the project's scripts as they were.
        start = json.loads((root / authors.LEDGER).read_text(encoding="utf-8").splitlines()[0])
        self.assertIn(BOX, start["baseline"]["block.py"])
        # A turn since that left the part alone holds its lines too: they are still nobody's.
        made = checkpoint(root, 2)
        self.assertEqual(self.read(file)["authors"], {})
        self.assertEqual(self.read(file, state["files"]).get("authors"), {})
        # The record is never in a checkpoint.
        self.assertNotIn(".studio", git(root, "ls-tree", "-r", "--name-only", made))

    def test_marks_a_hand_edit_as_yours(self):
        root, file = self.project()
        filleted = self.fillet(file, self.read(file))
        fillet = next(feature["text"] for feature in filleted["features"] if feature["kind"] == "Fillet")
        # The block, held in a name for the fillet to go on from, is still from before Studio kept track.
        self.assertIn(BOX_HELD, (root / "block.py").read_text(encoding="utf-8"))
        self.assertEqual(made_by(filleted), {fillet: "you"})
        # A turn's checkpoint holds it too, and it stays yours.
        checkpoint(root, 1)
        self.assertEqual(made_by(self.read(file)), {fillet: "you"})

    def test_marks_an_agent_turns_feature_as_the_agents(self):
        root, file = self.project()
        self.read(file)
        self.write(root, CHAMFERED)
        checkpoint(root, 1)
        # The block the turn held in a name is still from before.
        self.assertEqual(made_by(self.read(file)), {AGENT_CHAMFER: "agent"})

    def test_marks_nothing_a_turn_has_not_finished(self):
        root, file = self.project()
        # A turn long before Studio kept track chamfered the block, and the chamfer was taken out again.
        self.write(root, CHAMFERED)
        checkpoint(root, 1, LONG_AGO)
        self.write(root, BLOCK)
        self.read(file)
        self.write(root, CHAMFERED)
        running = self.read(file)
        self.assertIn(AGENT_CHAMFER, [feature["text"] for feature in running["features"]])
        self.assertEqual(running["authors"], {})
        # The turn ends: the part reads the same, and its marks are brought up to date.
        checkpoint(root, 2)
        again = self.read(file, running["files"])
        self.assertTrue(again["unchanged"])
        self.assertEqual(again["authors"], {key_of(running, AGENT_CHAMFER): "agent"})

    def test_never_starts_outside_a_git_folder(self):
        root, file = self.project(repository=False)
        filleted = self.fillet(file, self.read(file))
        self.assertEqual(filleted["authors"], {})
        self.assertFalse((root / ".studio").exists())
        # Nor where a folder named .git is no repository.
        (root / ".git").mkdir()
        self.assertEqual(self.read(file)["authors"], {})
        self.assertFalse((root / ".studio").exists())

    def test_undo_puts_back_whose_line_it_was_and_redo_whose_it_became(self):
        root, file = self.project()
        self.read(file)
        self.write(root, CHAMFERED)
        checkpoint(root, 1)
        state = self.read(file)
        chamfer = next(feature for feature in state["features"] if feature["text"] == AGENT_CHAMFER)
        edited = self.change(file, state, command={"command": "chamfer", "inputs": {"distance": "1"}, "replace": {"row": chamfer["key"]}})
        mine = next(feature["text"] for feature in edited["features"] if feature["kind"] == "Chamfer")
        self.assertEqual(made_by(edited), {mine: "you"})
        undone = self.change(file, edited, splice=edited["change"]["undo"])
        self.assertEqual(made_by(undone), {AGENT_CHAMFER: "agent"})
        # A size typed in the chamfer's row makes its line yours; Undo, the number written back, makes it the agent's again.
        row = next(row for row in undone["rows"] if row["kind"] == "Chamfer")
        typed = self.change(file, undone, input={"row": row["key"], "index": 0}, text="0.7")
        self.assertEqual(made_by(typed), {AGENT_CHAMFER.replace("0.5", "0.7"): "you"})
        back = self.change(file, typed, literal=typed["change"]["literal"], text=typed["change"]["from"])
        self.assertEqual(made_by(back), {AGENT_CHAMFER: "agent"})
        redone = self.change(file, back, splice=edited["change"]["redo"])
        self.assertEqual(made_by(redone), {mine: "you"})

    def test_a_git_command_that_fails_leaves_no_marks_and_the_part_still_reads(self):
        root, file = self.project()
        filleted = self.fillet(file, self.read(file))
        self.assertEqual(list(made_by(filleted).values()), ["you"])
        checkpoint(root, 1)
        # The repository broken under the project, then a hand edit to judge against the turn: the part still
        # reads, with no marks.
        (root / ".git" / "HEAD").rename(root / ".git" / "HEAD.moved")
        self.addCleanup(lambda: (root / ".git" / "HEAD.moved").rename(root / ".git" / "HEAD"))
        named = self.change(file, filleted, parameter={"name": "WALL", "value": "2"})
        self.assertEqual(named["authors"], {})
        self.assertEqual(self.read(file)["authors"], {})
        # No git at all: nothing is recorded, and nothing raises.
        other, _ = self.project()
        with mock.patch.dict(os.environ, {"PATH": str(other / "no-git-here")}):
            authors.start(other)
        self.assertFalse((other / ".studio").exists())

    def test_records_nothing_where_no_chat_has_run(self):
        # The viewer used on its own in a git folder: nothing written in it, nor in its git.
        root, file = self.project(chat=False)
        filleted = self.fillet(file, self.read(file))
        self.assertEqual(filleted["authors"], {})
        self.assertFalse((root / ".studio").exists())
        exclude = root / ".git" / "info" / "exclude"
        self.assertNotIn(b".studio", exclude.read_bytes() if exclude.exists() else b"")

    def test_a_chat_starting_is_no_turn_of_the_agents(self):
        root, file = self.project()
        self.read(file)
        # A line written outside Studio, then another chat's first run, whose checkpoint is taken before its agent writes.
        self.write(root, CHAMFERED)
        checkpoint(root, 0, scope="u")
        self.assertEqual(self.read(file)["authors"], {})

    def test_a_moved_script_keeps_whose_lines_they_were(self):
        root, file = self.project()
        filleted = self.fillet(file, self.read(file))
        fillet = next(feature["text"] for feature in filleted["features"] if feature["kind"] == "Fillet")
        # A turn that only moves the script into a folder: the block is still from before, the fillet still yours.
        (root / "parts").mkdir()
        (root / "block.py").rename(root / "parts" / "block.py")
        checkpoint(root, 1)
        self.assertEqual(made_by(self.read(str(root / "parts" / "block.step"))), {fillet: "you"})

    def test_a_turn_ending_in_the_same_second_as_another_counts(self):
        root, file = self.project()
        self.read(file)
        # Two chats' turns end in one second; the later one sorts first, by its ordinal, so the newest stays the other's.
        second = f"@{int(time.time()) + 2} +0000"
        checkpoint(root, 5, second, scope="a")
        self.write(root, CHAMFERED)
        running = self.read(file)
        # The view's poll judges the part between the two.
        self.assertEqual(self.read(file, running["files"])["authors"], {})
        checkpoint(root, 1, second, scope="b")
        again = self.read(file, running["files"])
        self.assertTrue(again["unchanged"])
        self.assertEqual(again["authors"], {key_of(running, AGENT_CHAMFER): "agent"})

    def test_a_rename_keeps_who_made_it(self):
        root, file = self.project()
        self.read(file)
        self.write(root, CHAMFERED)
        checkpoint(root, 1)
        state = self.read(file)
        renamed = self.change(file, state, rename={"feature": key_of(state, AGENT_CHAMFER), "title": "Chamfer1", "name": "Lid edge # 2"})
        self.assertEqual(made_by(renamed), {f"{AGENT_CHAMFER}  # Lid edge # 2": "agent"})

    def test_a_project_holding_a_virtual_environment_is_recorded_without_it(self):
        root, file = self.project()
        for name in ("venv/pyvenv.cfg", "venv/lib/python3.13/site-packages/pkg/__init__.py", "venv/bin/activate_this.py",
                     "node_modules/gyp/gyp.py", ".venv/lib/mod.py", "parts/sizes.py"):
            (root / name).parent.mkdir(parents=True, exist_ok=True)
            (root / name).write_text("WALL = 2\n", encoding="utf-8")
        self.read(file)
        start = json.loads((root / authors.LEDGER).read_text(encoding="utf-8").splitlines()[0])
        self.assertEqual(sorted(start["baseline"]), ["block.py", "parts/sizes.py"])
        # A project too big to record is found so once, not walked again on every trace.
        big, _ = self.project()
        with mock.patch.object(authors, "BASELINE_LIMIT", 8):
            authors.start(big)
            with mock.patch.object(authors.os, "walk", wraps=os.walk) as walked:
                authors.start(big)
        walked.assert_not_called()
        self.assertFalse((big / authors.LEDGER).exists())

    def test_a_git_exclude_file_in_utf16_leaves_the_part_readable(self):
        root, file = self.project()
        # A line appended as Windows PowerShell 5.1's `>>` appends one.
        exclude = root / ".git" / "info" / "exclude"
        exclude.parent.mkdir(exist_ok=True)
        with exclude.open("ab") as handle:
            handle.write("build/\r\n".encode("utf-16"))
        kept = exclude.read_bytes()
        for _ in range(2):
            self.assertEqual(self.read(file)["authors"], {})
        self.assertFalse((root / ".studio").exists())
        self.assertEqual(exclude.read_bytes(), kept)


if __name__ == "__main__":
    unittest.main()
