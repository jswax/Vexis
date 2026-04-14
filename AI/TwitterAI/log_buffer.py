from __future__ import annotations

import threading
import time
from collections import deque

_lock = threading.Lock()
_buf: deque[str] = deque(maxlen=2000)


def log(line: str) -> None:
    """
    Append a line to the in-memory log buffer and also print it.
    Intended for showing compute progress on the website.
    """
    msg = line.rstrip("\n")
    with _lock:
        _buf.append(msg)
    print(msg, flush=True)


def logf(fmt: str, *args: object) -> None:
    try:
        msg = fmt % args
    except Exception:
        msg = f"{fmt} {args}"
    log(msg)


def ts() -> str:
    return time.strftime("%H:%M:%S")


def get_lines(limit: int = 400) -> list[str]:
    with _lock:
        if limit <= 0:
            return list(_buf)
        return list(_buf)[-limit:]


def clear() -> None:
    with _lock:
        _buf.clear()

