from __future__ import annotations

import asyncio
import hashlib
import os
import re
import time
from abc import ABC, abstractmethod
from datetime import UTC, date, datetime
from decimal import Decimal
from typing import Any

import httpx

from .models import CabinPlan, FlightOffer, Passengers


class FlightProviderError(RuntimeError):
    pass


class FlightProvider(ABC):
    @abstractmethod
    async def search(
        self,
        *,
        origin: str,
        destination: str,
        departure_date: date,
        return_date: date | None,
        passengers: Passengers,
        cabin_plan: CabinPlan,
        currency: str,
        non_stop: bool,
    ) -> list[FlightOffer]:
        raise NotImplementedError


class DemoFlightProvider(FlightProvider):
    """Deterministic sample fares for trying the UI without credentials."""

    CABIN_MULTIPLIERS = {
        "ECONOMY": Decimal("1.00"),
        "PREMIUM_ECONOMY": Decimal("1.65"),
        "BUSINESS": Decimal("3.40"),
        "FIRST": Decimal("6.80"),
    }

    async def search(self, **kwargs: Any) -> list[FlightOffer]:
        await asyncio.sleep(0)
        departure: date = kwargs["departure_date"]
        return_date: date | None = kwargs["return_date"]
        plan: CabinPlan = kwargs["cabin_plan"]
        passengers: Passengers = kwargs["passengers"]
        seed_text = f'{kwargs["origin"]}{kwargs["destination"]}{departure.isoformat()}'
        seed = int(hashlib.sha256(seed_text.encode()).hexdigest()[:8], 16)
        base = Decimal(90 + seed % 230)
        outbound_multiplier = self.CABIN_MULTIPLIERS[plan.outbound.value]
        if return_date:
            inbound_multiplier = self.CABIN_MULTIPLIERS[plan.cabin_for_return().value]
            cabin_multiplier = (outbound_multiplier + inbound_multiplier) / 2
            trip_multiplier = Decimal("1.82")
        else:
            cabin_multiplier = outbound_multiplier
            trip_multiplier = Decimal("1")
        passenger_units = Decimal(passengers.adults) + Decimal("0.75") * passengers.children
        price = (base * cabin_multiplier * trip_multiplier * passenger_units).quantize(Decimal("0.01"))
        return [
            FlightOffer(
                plan_name=plan.name,
                outbound_cabin=plan.outbound,
                return_cabin=plan.cabin_for_return() if return_date else None,
                departure_date=departure,
                return_date=return_date,
                total_price=price,
                currency=kwargs["currency"],
                validating_airline=("BA", "LH", "AF", "KL")[seed % 4],
                stops=0 if kwargs["non_stop"] else seed % 2,
                duration_minutes=95 + seed % 520,
                booking_reference=f"DEMO-{seed:08X}",
                fetched_at=datetime.now(UTC),
            )
        ]


class AmadeusFlightProvider(FlightProvider):
    def __init__(self, api_key: str, api_secret: str, environment: str = "test") -> None:
        if not api_key or not api_secret:
            raise FlightProviderError("AMADEUS_API_KEY and AMADEUS_API_SECRET are required.")
        host = "test.api.amadeus.com" if environment == "test" else "api.amadeus.com"
        self.base_url = f"https://{host}"
        self.api_key = api_key
        self.api_secret = api_secret
        self._token: str | None = None
        self._token_expires_at = 0.0
        self._token_lock = asyncio.Lock()

    async def _access_token(self, client: httpx.AsyncClient) -> str:
        if self._token and time.monotonic() < self._token_expires_at:
            return self._token
        async with self._token_lock:
            if self._token and time.monotonic() < self._token_expires_at:
                return self._token
            response = await client.post(
                "/v1/security/oauth2/token",
                data={
                    "grant_type": "client_credentials",
                    "client_id": self.api_key,
                    "client_secret": self.api_secret,
                },
            )
            self._raise_for_api_error(response)
            payload = response.json()
            self._token = payload["access_token"]
            self._token_expires_at = time.monotonic() + int(payload.get("expires_in", 1800)) - 30
            return self._token

    @staticmethod
    def _raise_for_api_error(response: httpx.Response) -> None:
        if response.is_success:
            return
        try:
            payload = response.json()
            errors = payload.get("errors", [])
            detail = "; ".join(str(error.get("detail") or error.get("title")) for error in errors)
        except (ValueError, AttributeError):
            detail = response.text[:300]
        raise FlightProviderError(f"Flight provider returned HTTP {response.status_code}: {detail}")

    async def search(self, **kwargs: Any) -> list[FlightOffer]:
        plan: CabinPlan = kwargs["cabin_plan"]
        return_date: date | None = kwargs["return_date"]
        async with httpx.AsyncClient(base_url=self.base_url, timeout=30) as client:
            token = await self._access_token(client)
            body = self._request_body(**kwargs)
            response = await client.post(
                "/v2/shopping/flight-offers",
                headers={"Authorization": f"Bearer {token}"},
                json=body,
            )
            self._raise_for_api_error(response)
            data = response.json().get("data", [])
        return [self._parse_offer(item, plan, kwargs["departure_date"], return_date) for item in data]

    @staticmethod
    def _request_body(**kwargs: Any) -> dict[str, Any]:
        passengers: Passengers = kwargs["passengers"]
        plan: CabinPlan = kwargs["cabin_plan"]
        origin_destinations = [
            {
                "id": "1",
                "originLocationCode": kwargs["origin"],
                "destinationLocationCode": kwargs["destination"],
                "departureDateTimeRange": {"date": kwargs["departure_date"].isoformat()},
            }
        ]
        restrictions = [
            {"cabin": plan.outbound.value, "coverage": "MOST_SEGMENTS", "originDestinationIds": ["1"]}
        ]
        if kwargs["return_date"]:
            origin_destinations.append(
                {
                    "id": "2",
                    "originLocationCode": kwargs["destination"],
                    "destinationLocationCode": kwargs["origin"],
                    "departureDateTimeRange": {"date": kwargs["return_date"].isoformat()},
                }
            )
            restrictions.append(
                {
                    "cabin": plan.cabin_for_return().value,
                    "coverage": "MOST_SEGMENTS",
                    "originDestinationIds": ["2"],
                }
            )
        travelers = []
        traveler_id = 1
        for kind, count in (
            ("ADULT", passengers.adults),
            ("CHILD", passengers.children),
            ("HELD_INFANT", passengers.infants),
        ):
            for _ in range(count):
                traveler = {"id": str(traveler_id), "travelerType": kind, "fareOptions": ["STANDARD"]}
                if kind == "HELD_INFANT":
                    traveler["associatedAdultId"] = str(traveler_id - passengers.adults - passengers.children)
                travelers.append(traveler)
                traveler_id += 1
        filters: dict[str, Any] = {"cabinRestrictions": restrictions}
        if kwargs["non_stop"]:
            filters["connectionRestriction"] = {"maxNumberOfConnections": 0}
        return {
            "currencyCode": kwargs["currency"],
            "originDestinations": origin_destinations,
            "travelers": travelers,
            "sources": ["GDS"],
            "searchCriteria": {"maxFlightOffers": 10, "flightFilters": filters},
        }

    @staticmethod
    def _duration_minutes(value: str) -> int:
        match = re.fullmatch(r"PT(?:(\d+)H)?(?:(\d+)M)?", value)
        if not match:
            return 0
        return int(match.group(1) or 0) * 60 + int(match.group(2) or 0)

    @classmethod
    def _parse_offer(
        cls,
        item: dict[str, Any],
        plan: CabinPlan,
        departure_date: date,
        return_date: date | None,
    ) -> FlightOffer:
        itineraries = item.get("itineraries", [])
        stops = sum(max(0, len(itinerary.get("segments", [])) - 1) for itinerary in itineraries)
        duration = sum(cls._duration_minutes(itinerary.get("duration", "")) for itinerary in itineraries)
        return FlightOffer(
            plan_name=plan.name,
            outbound_cabin=plan.outbound,
            return_cabin=plan.cabin_for_return() if return_date else None,
            departure_date=departure_date,
            return_date=return_date,
            total_price=Decimal(item["price"]["grandTotal"]),
            currency=item["price"]["currency"],
            validating_airline=(item.get("validatingAirlineCodes") or ["Unknown"])[0],
            stops=stops,
            duration_minutes=duration,
            booking_reference=str(item.get("id", "")),
            fetched_at=datetime.now(UTC),
        )


def provider_from_environment() -> FlightProvider:
    provider_name = os.getenv("FLIGHT_PROVIDER", "demo").strip().lower()
    if provider_name == "demo":
        return DemoFlightProvider()
    if provider_name == "amadeus":
        return AmadeusFlightProvider(
            os.getenv("AMADEUS_API_KEY", ""),
            os.getenv("AMADEUS_API_SECRET", ""),
            os.getenv("AMADEUS_ENVIRONMENT", "test"),
        )
    raise FlightProviderError(f"Unsupported FLIGHT_PROVIDER: {provider_name}")

