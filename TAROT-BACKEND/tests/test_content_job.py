"""Nightly job scheduling glue: the earned-Stardust expiry sweep runs at most
once per UTC day and delegates to the (separately tested) expire operation."""

from datetime import datetime, timezone

from app.tasks import content_job as cj


class _FakeSession:
    def __enter__(self):
        return self

    def __exit__(self, *exc):
        return False


def test_daily_expiry_sweep_runs_once_per_utc_day(monkeypatch):
    calls = []
    monkeypatch.setattr(cj, "SessionLocal", lambda: _FakeSession())
    monkeypatch.setattr(
        cj,
        "expire_earned_stardust",
        lambda db, now=None: (
            calls.append(now),
            {"lots_expired": 0, "total_forfeited": 0.0},
        )[1],
    )
    cj._last_expiry_sweep_date = None

    day = datetime(2026, 7, 6, 3, 0, tzinfo=timezone.utc)
    cj._run_daily_expiry_sweep(day)
    cj._run_daily_expiry_sweep(day.replace(hour=9))  # same day → skipped
    assert len(calls) == 1

    cj._run_daily_expiry_sweep(day.replace(day=7))  # next day → runs again
    assert len(calls) == 2
