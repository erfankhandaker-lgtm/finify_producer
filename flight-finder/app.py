from __future__ import annotations

import asyncio
import os
from datetime import date, timedelta

import streamlit as st
from dotenv import load_dotenv

from flight_finder.models import Cabin, CabinPlan, Passengers, SearchRequest
from flight_finder.providers import FlightProviderError, provider_from_environment
from flight_finder.service import FlightSearchService


load_dotenv()
st.set_page_config(page_title="Flexible Flight Finder", page_icon="✈️", layout="wide")
st.title("Flexible Flight Finder")
st.caption("Compare prices across flexible dates and custom outbound/return cabin combinations.")


def label(cabin: Cabin) -> str:
    return cabin.value.replace("_", " ").title()


with st.sidebar:
    st.header("Trip")
    origin = st.text_input("From (IATA code)", "LON", max_chars=3).upper()
    destination = st.text_input("To (IATA code)", "DXB", max_chars=3).upper()
    round_trip = st.toggle("Round trip", value=True)
    departure = st.date_input("Departure", value=date.today() + timedelta(days=30))
    return_date = None
    if round_trip:
        return_date = st.date_input("Return", value=date.today() + timedelta(days=37))
    flexibility = st.slider("Flexible by", 0, 7, 7, format="±%d days")
    currency = st.selectbox("Currency", ["GBP", "EUR", "USD", "AED", "BDT"])
    non_stop = st.checkbox("Non-stop only")

    st.header("Passengers")
    adults = st.number_input("Adults", 1, 9, 1)
    children = st.number_input("Children", 0, 8, 0)
    infants = st.number_input("Infants (on lap)", 0, 8, 0)

st.subheader("Cabin plans")
st.write("Each selected row is priced separately. Mixed cabins apply outbound / return.")
default_plans = [
    {"Compare": True, "Name": "Economy", "Outbound": "ECONOMY", "Return": "ECONOMY"},
    {"Compare": True, "Name": "Premium economy", "Outbound": "PREMIUM_ECONOMY", "Return": "PREMIUM_ECONOMY"},
    {"Compare": True, "Name": "Business", "Outbound": "BUSINESS", "Return": "BUSINESS"},
    {"Compare": False, "Name": "Economy out / Business back", "Outbound": "ECONOMY", "Return": "BUSINESS"},
]
edited_plans = st.data_editor(
    default_plans,
    num_rows="dynamic",
    use_container_width=True,
    column_config={
        "Compare": st.column_config.CheckboxColumn(required=True),
        "Name": st.column_config.TextColumn(required=True),
        "Outbound": st.column_config.SelectboxColumn(options=[c.value for c in Cabin], required=True),
        "Return": st.column_config.SelectboxColumn(options=[c.value for c in Cabin], required=True),
    },
)

provider_name = os.getenv("FLIGHT_PROVIDER", "demo").lower()
if provider_name == "demo":
    st.info("Demo mode is active: prices are realistic-looking samples, not live bookable fares.")

if st.button("Find best prices", type="primary", use_container_width=True):
    try:
        plans = tuple(
            CabinPlan(
                name=str(row["Name"]).strip(),
                outbound=Cabin(row["Outbound"]),
                return_cabin=Cabin(row["Return"]) if round_trip else None,
            )
            for row in edited_plans
            if row["Compare"]
        )
        request = SearchRequest(
            origin=origin,
            destination=destination,
            departure_date=departure,
            return_date=return_date,
            flexibility_days=flexibility,
            passengers=Passengers(int(adults), int(children), int(infants)),
            cabin_plans=plans,
            currency=currency,
            non_stop=non_stop,
        )
        progress_bar = st.progress(0, text="Searching...")

        def update_progress(done: int, total: int) -> None:
            progress_bar.progress(done / total, text=f"Searched {done} of {total} combinations")

        service = FlightSearchService(provider_from_environment())
        offers = asyncio.run(service.search(request, update_progress))
        progress_bar.empty()
        if not offers:
            st.warning("No offers were returned for these dates and cabin plans.")
        else:
            best = offers[0]
            st.success(
                f"Best: {best.currency} {best.total_price:,.2f} — {best.plan_name} — "
                f"departing {best.departure_date:%d %b %Y}"
            )
            rows = [
                {
                    "Total": f"{offer.currency} {offer.total_price:,.2f}",
                    "Plan": offer.plan_name,
                    "Cabin": offer.cabin_summary,
                    "Departure": offer.departure_date,
                    "Return": offer.return_date,
                    "Airline": offer.validating_airline,
                    "Stops": offer.stops,
                    "Duration": f"{offer.duration_minutes // 60}h {offer.duration_minutes % 60}m",
                    "Reference": offer.booking_reference,
                }
                for offer in offers[:100]
            ]
            st.dataframe(rows, hide_index=True, use_container_width=True)
            st.caption("Prices can change until the provider confirms and books an offer.")
    except (ValueError, FlightProviderError) as exc:
        st.error(str(exc))
    except Exception as exc:
        st.error(f"Search failed: {exc}")

