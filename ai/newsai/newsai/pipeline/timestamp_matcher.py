"""
Map article publish time to the QQQ 1-minute bar used as price_t0 (regular hours only).

Rules from MVP spec:
- During RTH (9:30–16:00 ET): bar at publish time (minute-aligned).
- Pre-market: 9:31 ET bar that day.
- After hours / weekend: 9:31 ET on the next US equity session (weekends skipped; holidays not modeled).
"""

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

ET = ZoneInfo("America/New_York")
RTH_OPEN = time(9, 30)
ANCHOR = time(9, 31)
RTH_CLOSE = time(16, 0)


def _is_weekday(d: date) -> bool:
    return d.weekday() < 5


def _next_session_date(d: date) -> date:
    cur = d + timedelta(days=1)
    while not _is_weekday(cur):
        cur += timedelta(days=1)
    return cur


def _combine_et(d: date, t: time) -> datetime:
    return datetime(d.year, d.month, d.day, t.hour, t.minute, tzinfo=ET)


def _to_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        raise ValueError("datetime must be timezone-aware")
    return dt.astimezone(timezone.utc)


def resolve_baseline_bar_start(published_at: datetime) -> datetime:
    """
    Return UTC instant for the start of the 1-minute bar used as baseline (t0).
    """
    et = published_at.astimezone(ET)
    d = et.date()
    clock = et.time()

    if not _is_weekday(d):
        d0 = _next_session_date(d)
        return _to_utc(_combine_et(d0, ANCHOR))

    if clock < RTH_OPEN:
        return _to_utc(_combine_et(d, ANCHOR))

    if clock >= RTH_CLOSE:
        d0 = _next_session_date(d)
        return _to_utc(_combine_et(d0, ANCHOR))

    floored = et.replace(second=0, microsecond=0)
    return _to_utc(floored)


def impact_window_end(baseline_bar_start: datetime, minutes: int) -> datetime:
    """Bar-aligned window end: t0 open + `minutes` (for matching the tN bar open)."""
    if baseline_bar_start.tzinfo is None:
        raise ValueError("baseline_bar_start must be timezone-aware")
    return baseline_bar_start + timedelta(minutes=minutes)
