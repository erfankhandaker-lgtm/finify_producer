from __future__ import annotations

import asyncio
from collections.abc import Callable

from .dates import flexible_dates
from .models import FlightOffer, SearchRequest
from .providers import FlightProvider


class FlightSearchService:
    def __init__(self, provider: FlightProvider, max_concurrency: int = 4) -> None:
        self.provider = provider
        self.max_concurrency = max_concurrency

    async def search(
        self,
        request: SearchRequest,
        progress: Callable[[int, int], None] | None = None,
    ) -> list[FlightOffer]:
        request.validate()
        date_pairs = flexible_dates(
            request.departure_date,
            request.return_date,
            request.flexibility_days,
        )
        jobs = [(dates, plan) for dates in date_pairs for plan in request.cabin_plans]
        semaphore = asyncio.Semaphore(self.max_concurrency)
        completed = 0

        async def run_job(dates, plan) -> list[FlightOffer]:
            nonlocal completed
            async with semaphore:
                result = await self.provider.search(
                    origin=request.origin.strip().upper(),
                    destination=request.destination.strip().upper(),
                    departure_date=dates[0],
                    return_date=dates[1],
                    passengers=request.passengers,
                    cabin_plan=plan,
                    currency=request.currency.upper(),
                    non_stop=request.non_stop,
                )
            completed += 1
            if progress:
                progress(completed, len(jobs))
            return result

        results = await asyncio.gather(*(run_job(dates, plan) for dates, plan in jobs))
        offers = [offer for group in results for offer in group]
        return sorted(offers, key=lambda offer: (offer.total_price, offer.stops, offer.duration_minutes))

