# Crime data pack (PlainCrime + FBI UCR)

Static JSON/CSV served by `/api/crime/*`.

**Attribution:** PlainCrime (CC BY 4.0) + FBI Uniform Crime Reporting (U.S. government work, public domain).  
Cite: https://plaincrime.com/data/fbi-ucr-city-crime

**Files:** `stats.json`, `state-summary.json`, `state-trends.json`, `state_crime.json`, `city-index.json`, `national-trends.json`, `crime-types.json`, `arrest-data.json`, `homicide-data.json`, `hate-crime-by-state.json`, `plaincrime-city-crime.csv`

- `plaincrime-city-crime.csv` — official PlainCrime FBI UCR 2024 city extract (8,986 rows).
- `city-index.json` — derived from that CSV (rates per 100k, search/rank fields).
- National 2024 totals in `stats.json` / `national-trends.json` match FBI Reported Crimes in the Nation / PlainCrime portal figures.
- State choropleth inputs (`state-summary.json`, etc.) are packaged for SuperMap Crime mode; replace with full original uploads when available.
