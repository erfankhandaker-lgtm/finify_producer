from datetime import date

from flight_finder.dates import flexible_dates


def test_flexible_dates_preserve_trip_length() -> None:
    results = flexible_dates(
        date(2027, 2, 10),
        date(2027, 2, 17),
        2,
        today=date(2027, 1, 1),
    )
    assert len(results) == 5
    assert results[0] == (date(2027, 2, 8), date(2027, 2, 15))
    assert all((return_date - departure).days == 7 for departure, return_date in results)


def test_flexible_dates_do_not_include_the_past() -> None:
    results = flexible_dates(date(2027, 2, 10), None, 2, today=date(2027, 2, 9))
    assert results[0] == (date(2027, 2, 9), None)

