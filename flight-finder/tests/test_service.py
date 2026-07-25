import asyncio
from datetime import date

from flight_finder.models import Cabin, CabinPlan, Passengers, SearchRequest
from flight_finder.providers import DemoFlightProvider
from flight_finder.service import FlightSearchService


def test_search_returns_sorted_offers_for_every_combination() -> None:
    request = SearchRequest(
        origin="LON",
        destination="DXB",
        departure_date=date(2027, 3, 10),
        return_date=date(2027, 3, 17),
        flexibility_days=1,
        passengers=Passengers(adults=2),
        cabin_plans=(
            CabinPlan("Economy", Cabin.ECONOMY, Cabin.ECONOMY),
            CabinPlan("Mixed", Cabin.ECONOMY, Cabin.BUSINESS),
        ),
    )
    offers = asyncio.run(FlightSearchService(DemoFlightProvider()).search(request))
    assert len(offers) == 6
    assert offers == sorted(offers, key=lambda offer: (offer.total_price, offer.stops, offer.duration_minutes))
    assert {offer.plan_name for offer in offers} == {"Economy", "Mixed"}

