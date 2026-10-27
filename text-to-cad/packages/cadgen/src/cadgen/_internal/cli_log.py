"""A command's progress lines on stderr, ``[fea] ...``: what ``cadgen fea`` and ``cadgen cam`` say while they run.

Studio-owned: the part of cadgen 0.7's ``cli_logging.CliLogger`` (2f793659fb) those commands use, which 0.8
removed with the old pipeline. ``info`` always prints; ``debug`` and the ``timed`` stage lines only with
``verbose``.
"""

from __future__ import annotations

import sys
import time
from contextlib import contextmanager
from typing import Iterator, TextIO

__all__ = ["CliLogger"]


class CliLogger:
    def __init__(self, name: str, verbose: bool = False, stream: TextIO | None = None) -> None:
        self.name = name
        self.verbose = verbose
        self.stream = stream

    def info(self, message: str) -> None:
        print(f"[{self.name}] {message}", file=self.stream or sys.stderr)

    def debug(self, message: str) -> None:
        if self.verbose:
            self.info(message)

    @contextmanager
    def timed(self, label: str) -> Iterator[None]:
        """A stage, said when it starts and how long it took (``verbose`` only)."""
        started = time.perf_counter()
        self.debug(f"{label} started")
        try:
            yield
        finally:
            self.debug(f"{label} completed in {_elapsed(time.perf_counter() - started)}")


def _elapsed(seconds: float) -> str:
    if seconds < 1.0:
        return f"{seconds * 1000.0:.0f}ms"
    if seconds < 60.0:
        return f"{seconds:.2f}s"
    minutes, remainder = divmod(seconds, 60.0)
    return f"{int(minutes)}m {remainder:.1f}s"
