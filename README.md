# RailPath India
**Intelligent Indian Railway Route Finder, Automatic Multi-Route Planner & Live Connection Monitor**

> *Search once. Discover more routes. Compare real train status. Make safer connections.*

---

## 1. Overview
**RailPath India** is a full-stack Indian Railway journey-planning and connection-monitoring application designed for passengers travelling across routes with limited direct connectivity (such as **Rourkela Junction `ROU` → Varanasi Junction `BSB`**).

Instead of manually searching intermediate junctions (`RNC`, `HTE`, `TATA`, `DHN`, `GAYA`, `DDU`, `MURI`, `BKSC`, `PCOI`), comparing rail distances, and guessing whether a 2.5-hour or 3-hour layover is safe, passengers enter their Origin and Destination once. RailPath India:
1. Searches all date-eligible **Direct Trains**.
2. Automatically discovers **Multi-Train Connecting Routes** (2-leg and 3-leg journeys) sorted by lowest total rail distance, shortest duration, best overall recommendation, or safest connection.
3. Evaluates **Transfer Buffers** (`150m` Aggressive, `180m` Default Target, `240m` Safer, or Custom) against **30-Day Historical Arrival Delays** (median, 90th percentile, >15m/>30m/>60m delay rates) and **Live Running Status**.
4. Lets passengers **inspect and swap trains on individual legs** with instant recalculation of layover times, risk classifications, and 100-point recommendation scores.
5. Provides a dedicated **Live Train Status** tracker and a side-by-side **Compare Two Trains Live** connection monitor.

---

## 2. Validated Nationwide Station Directory
- Backed by the preserved `data/Railway_stations.json` dataset (`8,938` unique Indian Railways stations across `18` zones, `0` missing fields, `0` duplicate station codes).
- Supports fast search by station code (`ROU`, `BSB`, `DDU`, `RNC`), station name, city/historical alias (`Banaras`, `Kashi`, `Mughalsarai`, `Allahabad`, `Jamshedpur`, `Bengaluru`), Hindi/Devanagari queries (`वाराणसी`, `रांची`, `राउरकेला`, `धनबाद`, `टाटानगर`, `पटना`, `दिल्ली`), and typo-tolerant fuzzy matching.

---

## 3. Quick Start & Commands

```bash
# Install dependencies
npm install

# Run unit & integration test suite (node:test via tsx)
npm test

# Type-check codebase
npm run lint

# Start full-stack Express + Vite development server on port 3000
npm run dev

# Build production bundle
npm run build
```

---

## 4. External Railway API Configuration (`.env`)
Copy `.env.example` to `.env`. By default, `RAILWAY_LIVE_PROVIDER="demo"` runs the application with the verified 8,938-station dataset, real timetable corridors, and clearly badged `DEMO` live/historical status simulation. To activate live external API calls:
- Set `RAILWAY_LIVE_PROVIDER="rapidapi_irctc"` and provide `RAPIDAPI_IRCTC_KEY`
- Or set `RAILWAY_LIVE_PROVIDER="ntes_partner"` and provide `NTES_PARTNER_API_KEY` and `NTES_PARTNER_BASE_URL`

See [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md) and [`docs/ROUTING_ALGORITHM.md`](docs/ROUTING_ALGORITHM.md) for full technical details.
