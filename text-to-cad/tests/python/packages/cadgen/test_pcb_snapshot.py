"""`cadgen pcb snapshot` on cadgen 0.8: the engine draws no board picture yet, and the verb says so.

Boards still open in the CAD Viewer (its board renderer reads the board's plot); only the picture
is missing until a board renderer lands on the engine. So the verb refuses, naming the board and
where to see it, and writes no file: never a blank or a stale picture.

The board is the test board (`tests/python/support/kicad_board.py`): no KiCad, no corpus model.
"""

from __future__ import annotations

import contextlib
import io
import shutil
import tempfile
import unittest
from pathlib import Path

from tests.python.support.kicad_board import write_board
from tests.python.support.paths import add_repo_path

add_repo_path("packages/cadgen/src")


class BoardSnapshotTest(unittest.TestCase):
    def setUp(self) -> None:
        self.folder = Path(tempfile.mkdtemp(prefix="pcb-snapshot-"))
        self.addCleanup(shutil.rmtree, self.folder, True)
        self.board = write_board(self.folder)
        self.out = self.folder / "board.png"

    def test_the_verb_says_it_draws_no_picture_yet_and_writes_none(self) -> None:
        from cadgen import pcb

        with self.assertRaisesRegex(RuntimeError, r"no board picture on this engine yet: .*blinky\.kicad_pcb.*CAD Viewer"):
            pcb.snapshot(self.board, self.out)
        self.assertFalse(self.out.exists())

    def test_the_command_fails_with_that_sentence(self) -> None:
        from cadgen.cli import pcb_snapshot

        said = io.StringIO()
        with contextlib.redirect_stderr(said), contextlib.redirect_stdout(said):
            code = pcb_snapshot.main([str(self.board), str(self.out)])
        self.assertNotEqual(code, 0)
        self.assertIn("no board picture on this engine yet", said.getvalue())
        self.assertFalse(self.out.exists())


if __name__ == "__main__":
    unittest.main()
