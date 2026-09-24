# Crime data pack (PlainCrime + FBI UCR)

Static JSON/CSV served by `/api/crime/*`.

**Attribution:** PlainCrime (CC BY 4.0) + FBI Uniform Crime Reporting (U.S. government work, public domain).  
Cite: https://plaincrime.com/data/fbi-ucr-city-crime

**Files (user-provided PlainCrime/FBI extracts):**

| File | Approx size |
|------|-------------|
| `city-index.json` | ~4.2 MB |
| `state_crime.json` | ~2.3 MB |
| `state-trends.json` | ~965 KB |
| `plaincrime-city-crime.csv` | ~436 KB |
| `arrest-data.json` | ~66 KB |
| `crime-types.json` | ~34 KB |
| `state-summary.json` | ~16 KB |
| `national-trends.json` | ~16 KB |
| `stats.json` | ~15 KB |
| `homicide-data.json` | ~13 KB |
| `hate-crime-by-state.json` | ~8.5 KB |

City search is paginated via `/api/crime/cities` — do not ship the full city index to the browser on load.
