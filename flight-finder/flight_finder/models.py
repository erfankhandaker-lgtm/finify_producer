from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from enum import StrEnum


class Cabin(StrEnum):
    ECONOMY = "ECONOMY"
    PREMIUM_ECONOMY = "PREMIUM_ECONOMY"
    BUSINESS = "BUSINESS"
    FIRST = "FIRST"


@dataclass(frozen=True)
class CabinPlan:
    name: str
    outbound: Cabin
    return_cabin: Cabin | None = None

    def cabin_for_return(self) -> Cabin:
        return self.return_cabin or self.outbound


@dataclass(frozen=True)
class Passengers:
    adults: int = 1
    children: int = 0
    infants: int = 0

    def validate(self) -> None:
        if self.adults < 1:
            raise ValueError("At least one adult is required.")
        if min(self.children, self.infants) < 0:
            raise ValueError("Passenger counts cannot be negative.")
        if self.infants > self.adults:
            raise ValueError("Infants cannot exceed the number of adults.")
        if self.adults + self.children > 9:
            raise ValueError("A maximum of 9 seated passengers is supported.")


@dataclass(frozen=True)
class SearchRequest:
    origin: str
    destination: str
    departure_date: date
    return_date: date | None
    flexibility_days: int
    passengers: Passengers
    cabin_plans: tuple[CabinPlan, ...]
    currency: str = "GBP"
    non_stop: bool = False

    def validate(self) -> None:
        origin = self.origin.strip().upper()
        destination = self.destination.strip().upper()
        if len(origin) != 3 or not origin.isalpha():
            raise ValueError("Origin must be a 3-letter IATA airport or city code.")
        if len(destination) != 3 or not destination.isalpha():
            raise ValueError("Destination must be a 3-letter IATA airport or city code.")
        if origin == destination:
            raise ValueError("Origin and destination must be different.")
        if self.return_date and self.return_date <= self.departure_date:
            raise ValueError("Return date must be after departure date.")
        if not 0 <= self.flexibility_days <= 7:
            raise ValueError("Flexibility must be between 0 and 7 days.")
        if not self.cabin_plans:
            raise ValueError("Select at least one cabin plan.")
        if len(self.currency) != 3 or not self.currency.isalpha():
            raise ValueError("Currency must be a 3-letter ISO code.")
        self.passengers.validate()


@dataclass(frozen=True)
class FlightOffer:
    plan_name: str
    outbound_cabin: Cabin
    return_cabin: Cabin | None
    departure_date: date
    return_date: date | None
    total_price: Decimal
    currency: str
    validating_airline: str
    stops: int
    duration_minutes: int
    booking_reference: str
    fetched_at: datetime

    @property
    def cabin_summary(self) -> str:
        if self.return_cabin is None:
            return self.outbound_cabin.value.replace("_", " ").title()
        outbound = self.outbound_cabin.value.replace("_", " ").title()
        inbound = self.return_cabin.value.replace("_", " ").title()
        return outbound if outbound == inbound else f"{outbound} / {inbound}"

