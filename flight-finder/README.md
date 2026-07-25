# Flexible Flight Finder

A standalone Streamlit application that compares one-way or return flight prices across:

- origin and destination IATA codes;
- adult, child, and infant passenger counts;
- a departure/return date shifted together by up to 7 days;
- Economy, Premium Economy, Business, First, or mixed outbound/return cabins;
- optional non-stop filtering.

The app starts in deterministic demo mode. Demo prices are not live fares. Live mode uses the Amadeus Flight Offers Search API.

## Run it

```bash
cd flight-finder
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -e '.[test]'
cp .env.example .env
streamlit run app.py
```

Open the local URL printed by Streamlit, normally `http://localhost:8501`.

## Enable live fares

Create a Self-Service application in the Amadeus developer portal, then edit `.env`:

```dotenv
FLIGHT_PROVIDER=amadeus
AMADEUS_API_KEY=your_key
AMADEUS_API_SECRET=your_secret
AMADEUS_ENVIRONMENT=test
```

The test environment has limited sample data. Use `production` only after obtaining production access. Never commit the `.env` file or expose the secret in the browser.

## Cabin rules

The editable cabin-plan table is the rule layer. Examples:

- `ECONOMY` outbound + `ECONOMY` return;
- `ECONOMY` outbound + `BUSINESS` return;
- `BUSINESS` outbound + `PREMIUM_ECONOMY` return.

Add, remove, rename, or select rows before searching. For a one-way search, only the outbound cabin is used.

## Current search interpretation

For a return trip from 10 August to 20 August with ±7-day flexibility, the app searches 3–17 August departures and 13–27 August returns while preserving the 10-night trip length. It does not create every possible departure/return cross-product, which keeps API usage bounded and makes the results comparable.

