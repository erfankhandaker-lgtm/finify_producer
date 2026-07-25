from __future__ import annotations

from datetime import date, timedelta


def flexible_dates(
    departure_date: date,
    return_date: date | None,
    flexibility_days: int,
    *,
    today: date | None = None,
) -> list[tuple[date, date | None]]:
    """Shift both trip dates together, preserving the length of the trip."""
    earliest = today or date.today()
    candidates: list[tuple[date, date | None]] = []
    for offset in range(-flexibility_days, flexibility_days + 1):
        shifted_departure = departure_date + timedelta(days=offset)
        if shifted_departure < earliest:
            continue
        shifted_return = return_date + timedelta(days=offset) if return_date else None
        candidates.append((shifted_departure, shifted_return))
    return candidates

