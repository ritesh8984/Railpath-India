# RailPath India — System Architecture & Technical Reference (`ARCHITECTURE.md`)

**Document Version:** 1.0  
**Last Updated:** 2026-11-01  
**Scope:** Actual implemented architecture, file structure, data pipelines, and algorithms in the current RailPath India codebase.

---

## 1. Technology Stack

- **Runtime & Backend**: Node.js (ES Modules) + Express `^4.21.2` (`server.ts`), executed in development via `tsx` (`^4.21.0`) on port `3000`.
- **Frontend Framework**: React `^19.0.1` + React DOM `^19.0.1` with TypeScript `^7.0.2`.
- **Bundler & Dev Middleware**: Vite `^8.3.0` (`vite.config.ts`) mounted inside `server.ts` via `vite.middlewares` in development mode and serving static `/dist` assets in production.
- **Styling**: Tailwind CSS v4 (`@tailwindcss/vite` `^4.3.3` via `@import "tailwindcss";` in `src/index.css`), with `Plus Jakarta Sans` for UI copy and `JetBrains Mono` (`tabular-nums`) for train numbers, station codes, timings, and distances.
- **Icons**: `lucide-react` `^0.546.0`.
- **Automated Testing**: Node.js built-in test runner (`node:test` + `node:assert/strict`) executed via `npx --yes tsx --test src/lib/railpath.test.ts`.

---

## 2. Repository & File Structure

```text
/
├── .env.example                       # Optional environment variable template (no secrets required)
├── index.html                         # HTML entry point & Google Fonts (Plus Jakarta Sans, JetBrains Mono)
├── metadata.json                      # Application metadata
├── package.json                       # Scripts & dependencies
├── server.ts                          # Express API server + Vite middleware + dataset initialization
├── tsconfig.json                      # TypeScript compiler configuration
├── vite.config.ts                     # Vite bundler configuration
├── data/
│   ├── Railway_stations.json          # 8,938-station Indian Railways directory across 18 zones (782 KB)
│   ├── nationwide_timetable.json      # Normalized DataMeet CC0 timetable: 5,058 trains, 100,694 stops (4.8 MB)
│   ├── verified_stop_distances.json   # Verified per-stop cumulative distances for 5,058 trains (999 KB)
│   └── distance_quality_report.json   # Audit & quarantine metrics across candidate datasets (8.0 KB)
├── docs/
│   ├── PRD.md                         # Product Requirements Document
│   ├── ARCHITECTURE.md                # System Architecture & Technical Reference (this file)
│   ├── RULES.md                       # Strict Engineering & Data Integrity Rules
│   ├── PHASES.md                      # 10-Phase Development Roadmap & Completion Status
│   ├── DESIGN.md                      # Current UI Audit & Target Classical Design Specification
│   ├── MEMORY.md                      # Persistent Project Memory Log
│   ├── DATA_SOURCES.md                # Supplementary Data Provenance Notes
│   ├── IMPLEMENTATION_PLAN.md         # Historical Implementation Notes
│   └── ROUTING_ALGORITHM.md           # Mathematical Formulation of Routing & Scoring
├── scripts/
│   ├── buildNationwideTimetable.cjs   # Offline importer: DataMeet schedules.json + trains.json -> nationwide_timetable.json
│   └── buildVerifiedStopDistances.cjs # Offline auditor & builder: raildb.sqlite + track graph -> verified_stop_distances.json
└── src/
    ├── main.tsx                       # React DOM root mount
    ├── App.tsx                        # Top-level application state, URL/History router, 3-step planner flow
    ├── index.css                      # Tailwind v4 import, font variables, screen-transition animation
    ├── types/
    │   └── railway.ts                 # Core TypeScript interfaces & domain contracts
    ├── data/
    │   └── railwayDataset.ts          # Timetable loader, verified stop-distance merger, stop-integrity validator
    ├── lib/
    │   ├── stationSearch.ts           # Station normalization, disambiguation, audit, & ranked autocomplete
    │   ├── routingEngine.ts           # Route graph, direct search, multi-route discovery, distance & recommendation engine
    │   └── railpath.test.ts           # 23 automated unit & integration test suites
    └── components/
        ├── StationSelector.tsx        # Accessible station autocomplete input with keyboard navigation
        ├── DirectTrainsView.tsx       # Direct train results list & expandable full stop schedule modal/drawer
        ├── MultiRoutesView.tsx        # Screen 2 (Route Option summary cards) & Screen 3 (Per-leg Train Options)
        ├── LiveStatusView.tsx         # Scheduled train timeline & interactive what-if delay simulator
        ├── CompareTrainsView.tsx      # Two-train interchange detector & live/manual delay stress-tester
        └── StationAuditModal.tsx      # Station Directory explorer, zone breakdown, & dataset audit viewer
```

---

## 3. Frontend Architecture, Routing & State Management

### 3.1 Top-Level Screens (`ActiveScreen` in `src/App.tsx`)
The application provides four top-level views accessible via the top navigation bar on desktop and the sticky bottom bar on mobile:
1. **`planner`** (*Route Planner*): Contains the 3-step journey planning workflow.
2. **`live`** (*Live Train Status* — `src/components/LiveStatusView.tsx`): Inspects any train's ordered stop schedule and simulates delay propagation (`0m` to `360m`).
3. **`compare`** (*Compare Two Trains* — `src/components/CompareTrainsView.tsx`): Finds shared interchange stations between an incoming and outgoing train and stress-tests transfer feasibility under custom delays.
4. **`directory`** (*Station Directory* — `src/components/StationAuditModal.tsx`): Displays the `StationAuditReport`, zone distribution across all `18` zones, and searchable station directory.

### 3.2 Three-Step Route Planner Navigation (`PlannerStep` in `src/App.tsx`)
Within `activeScreen === 'planner'`, navigation is structured into three distinct, non-overlapping steps:
1. **Screen 1 — Dedicated Search Screen (`plannerStep === 'search'`)**:
   - Displays the origin/destination `StationSelector` components, station swap button, IST journey date picker, target transfer buffer selector (`150m`, `180m`, `240m`), and recent/saved journeys.
2. **Screen 2 — Dedicated Route Results Screen (`plannerStep === 'results'`)**:
   - Displays the search summary bar (`Back to Search`, origin/destination badges, `Direct Trains (N)` vs `Multiple Routes (M)` switcher).
   - When `journeyMode === 'multi'`, `MultiRoutesView` (with `selectedRouteId = null`) renders a direct-train priority banner (if direct trains exist), filter/sort controls (`Lowest Rail Distance`, `Shortest Duration`, `Best Recommendation`, `Safest Connections`, plus detour limits `+25% Default`, `+50% Extended`, `Show All (+100%)`), and compact **Route Option Summary Cards**.
3. **Screen 3 — Dedicated Train Options Screen (`plannerStep === 'train-options'`)**:
   - Triggered when the user clicks **`View Train Options →`** on a specific route card (`selectedRouteId` set).
   - Renders `MultiRoutesView` focused exclusively on that route's **Active Train Combination & Interchange Evaluation**, **Railway Distance Verification & Recommendation Score Breakdown**, and **Per-Leg Candidate Train Selection Cards** (`Leg 1 of N`, `Leg 2 of N`, etc.).

### 3.3 URL Query & Browser History Synchronization
- `src/App.tsx` synchronizes `activeScreen`, `plannerStep`, `selectedRouteId`, `fromCode`, `toCode`, `journeyDate`, `journeyMode`, `sortBy`, and `categoryFilter` with:
  - **URL query parameters**: `?screen=search|results|train-options&from=ROU&to=BSB&date=2026-10-28&mode=multi&routeId=...`
  - **Browser History API**: `window.history.pushState` / `replaceState` and a `popstate` listener so browser Back/Forward buttons transition cleanly between `Train Options → Route Results → Search`.
  - **Session Persistence**: `sessionStorage` (`railpath_planner_session_v1`) and `localStorage` (`railpath_saved_journeys`).

---

## 4. Backend Architecture (`server.ts`)

`server.ts` exposes 8 JSON REST endpoints and initializes datasets once in memory via `getServerData()`:

| Endpoint | Method | Purpose & Underlying Implementation |
| :--- | :--- | :--- |
| `/api/stations/audit` | `GET` | Returns `StationAuditReport` from `auditStationsDataset()` (`8,938` records, `18` zones, duplicate/missing checks). |
| `/api/stations/search` | `GET` | Ranked station autocomplete (`?q=...&limit=15&zone=...`) via `searchStations()`. |
| `/api/trains/direct` | `GET` | Direct train search (`?from=ROU&to=BSB&date=2026-10-28`) via `findDirectTrains()`. |
| `/api/routes/multi` | `GET` | Multi-route discovery (`?from=...&to=...&date=...&buffer=180&maxDetour=25&tighter=false&maxLegs=3`) via `findMultiRoutes()`. |
| `/api/routes/evaluate` | `POST` | Re-evaluates a `MultiRouteCandidate` when the user selects different candidate trains on any leg via `evaluateCustomLegSelection()`. |
| `/api/trains/list` | `GET` | Searches the `5,058`-train directory by train number, name, origin, or destination. |
| `/api/trains/:trainNumber/live` | `GET` | Returns scheduled stop timeline and applies optional `?delay=` override via `getLiveTrainStatus()`. |
| `/api/trains/compare` | `GET` | Compares two trains at a shared interchange (`?incoming=...&outgoing=...&date=...&station=...&incomingDelay=...&outgoingDelay=...&buffer=180`) via `compareTwoTrainsLive()`. |
| `/api/providers/status` | `GET` | Reports active budget mode (`ZERO_COST_LOCAL_MODE`), dataset record counts, and offline status of live/historical feeds. |

---

## 5. Data Pipelines & Datasets

### 5.1 Station Directory (`data/Railway_stations.json` & `src/lib/stationSearch.ts`)
- **Input**: `data/Railway_stations.json` containing `8,938` objects with `{ CODE, STATION_NAME, RAILWAY_ZONE }`.
- **Normalization (`normalizeStationsDataset`)**:
  - Maps zone codes (`NR`, `SER`, `ECOR`, `ECR`, etc.) to full zone names.
  - Classifies station categories (`JUNCTION`, `TERMINUS`, `CENTRAL`, `CANTT`, `HALT`, `REGULAR`).
  - Attaches curated city/historical aliases (`CURATED_STATION_METADATA`, e.g., `BSB` → Varanasi / Banaras / Kashi; `DDU` → Mughalsarai) and marks major railway interchanges (`MAJOR_INTERCHANGE_CODES`).
  - Disambiguates `69` shared station names across zones by appending zone codes to `displayName`.

### 5.2 Nationwide Timetable (`data/nationwide_timetable.json` & `scripts/buildNationwideTimetable.cjs`)
- **Source**: DataMeet Indian Railways dataset (`schedules.json` + `trains.json`, CC0 1.0 Public Domain).
- **Records**: `5,058` trains and `100,694` commercial stop entries (`90,578` intermediate stops).
- **Stop Integrity Validation (`buildNationwideTrainServices` in `src/data/railwayDataset.ts`)**:
  - Rejects any train with fewer than 2 stops, consecutive duplicate station codes (`prevCode === currCode`), or non-commercial passing rows (`arrival !== null && departure !== null && arrival === departure`).
  - Permits non-adjacent repeated station codes so circular/loop routes (`148` trains) are preserved.

### 5.3 Verified Per-Stop Cumulative Distance Pipeline (`data/verified_stop_distances.json` & `scripts/buildVerifiedStopDistances.cjs`)
- **Why Enrichment Was Required**: Raw DataMeet `schedules.json` has no distance field on stop rows, so `data/nationwide_timetable.json` originally had `km = 0` at origin, `km = train.dist` at destination, and `km = null` on all `90,578` intermediate stops (`10.02%` total stop coverage, `0.00%` intermediate stop coverage).
- **Open-Source Enrichment Sources**:
  1. **Primary Source (`R`)**: `arshadkazmi42/offline-train-time-table` (`assets/raildb.sqlite`, **MIT License**), packaging the official **Open Government Data Platform India (`data.gov.in`) Ministry of Railways All-India Train Time Table** (**GODL-India**). Provides integer cumulative distances for `2,810` trains (`69,006` stops; `2,703` strictly monotonic trains; `107` non-monotonic slip-coach trains quarantined).
  2. **Secondary Track-Graph Reconciliation (`G`)**: Directed adjacent station-to-station track edges (`14,757` edges across `5,637` stations) extracted from the `2,703` monotonic `raildb.sqlite` trains and `1,720` single-segment DataMeet trains (`train.dist`). Reconciles intermediate stop cumulative distances for timetable trains when total cumulative track distance agrees with `train.dist` within `max(15 km, 5%)`.
- **Post-Enrichment Verified Coverage (`data/distance_quality_report.json`)**:
  - **Total Trains**: `5,058`
  - **Trains with Verified Intermediate Stop Distances**: `4,571 / 5,058` (**`90.37%`**) — comprising `2,621` `VERIFIED_COMPLETE` (`51.82%`) and `1,950` `VERIFIED_PARTIAL` (`38.55%`).
  - **Trains Without Verified Intermediate Stop Distances**: `487 / 5,058` (**`9.63%`**) — comprising `468` `ENDPOINT_ONLY` trains and `19` `UNVERIFIED` trains (including `31` trains where DataMeet `dist` is `null`).
  - **Total Stops Verified**: `80,382 / 100,694` (**`79.83%`**), up from `10,085` (`10.02%`).
  - **Intermediate Stops Verified**: `70,288 / 90,578` (**`77.60%`**), up from `0` (`0.00%`).

---

## 6. Core Algorithms (`src/lib/routingEngine.ts`)

### 6.1 In-Memory Route Graph (`getRouteGraph`)
Builds and caches (via `WeakMap<TrainService[], RailwayRouteGraph>`) four primary indices:
1. `trainsAtStation`: `Map<stationCode, Array<{ train, stopIdx, stop }>>`
2. `stopIndicesByStationAndTrain`: `Map<stationCode, Map<trainNumber, number[]>>` (supports repeated station codes on circular/loop trains by storing all stop indices `idx1 < idx2`).
3. `corridorEdgeKm`: `Map<"FROM->TO", { medianKm, minKm, maxKm, referenceTrains }>` built from verified adjacent timetable stops.
4. `corridorDirectKm`: `Map<"FROM->TO", { medianKm, minKm, maxKm, referenceTrains }>`.

### 6.2 Single-Leg & Multi-Leg Railway Distance Calculation (`calculateVerifiedLegDistance` & `calculateVerifiedRouteDistance`)
1. Resolves exact stop indices `actualFromIdx < actualToIdx` on the train's ordered `stops` array.
2. **Quarantine Check**: Scans `train.stops[actualFromIdx .. actualToIdx]`. If any recorded `distanceKm >= 0` is non-monotonic (`stopKm <= lastRecordedKm`), the leg is immediately quarantined (`distanceReliable: false`, `MISSING_STOP_DISTANCE_DATA`) without falling back.
3. **Priority A (`VERIFIED_TIMETABLE_CUMULATIVE_KM`)**: If both `fromStop.distanceKm >= 0` and `toStop.distanceKm > fromStop.distanceKm`, computes:
   $$\text{distanceKm} = \text{toStop.distanceKm} - \text{fromStop.distanceKm}$$
4. **Priority B (`CORRIDOR_VERIFIED_TIMETABLE_KM`)**: If stop `distanceKm` is `-1` (unmapped), sums verified adjacent track-graph edges (`resolveSegmentByCorridorIndex`) along the exact stop sequence of that leg.
5. **Priority C (`MISSING_STOP_DISTANCE_DATA`)**: Returns `distanceKm: 0, distanceReliable: false`.
6. **Multi-Leg Route Total (`calculateVerifiedRouteDistance`)**:
   - Sums `leg.distanceKm` only if **all** legs have `distanceReliable === true` and `distanceKm > 0`.
   - If even one leg lacks verified distance, sets `totalDistanceKm = 0`, `distanceReliable = false`, and `distanceIncompleteDetail = "Distance incomplete — distance data unavailable for one leg."`
   - Computes `verifiedDistanceRangeKm` (`minKm`, `maxKm`) across all verified candidate trains for each leg of a route.

### 6.3 Multi-Route Discovery (`findMultiRoutes`)
1. **Direct Baseline**: Runs `findDirectTrains(fromCode, toCode, journeyDate, trains)` first to establish whether direct services exist and to determine `DIRECT_TRAIN_BASELINE` distance.
2. **2-Leg & 3-Leg Search**:
   - Explores candidate interchange stations reachable from `fromCode` on `journeyDate`.
   - Verifies each candidate train leg via `verifyTrainLegAgainstTimetable()` (checking commercial halts, positive duration, and date-adjusted operating day at the boarding stop).
   - Evaluates exact calendar arrival date and next-leg departure date (`same day` or `next day`), requiring `scheduledLayoverMinutes >= 15` (when `includeTighterConnections = true`) or `>= min(90, targetBufferMinutes - 30)` and `<= 1440` minutes (`24h`).
   - Prevents cycles (`stationSequence` has strictly unique station codes, and intermediate stops on subsequent legs cannot pass back through prior stations).
3. **Detour Categorization & Filtering**:
   - Compares each route's verified `totalDistanceKm` against `baselineDistanceKm` (`DIRECT_TRAIN_BASELINE` if direct trains exist, else `SHORTEST_FEASIBLE_PATH_BASELINE`).
   - Categorizes routes into `Low-distance alternatives` ($\le +10\%$), `Recommended alternatives` ($+10\%$ to $+25\%$), and `Longer-distance alternatives` ($> +25\%$).

### 6.4 Transparent Recommendation Algorithm (`calculateRecommendationScore`)
Computes five component scores (`0..100`):
- `distanceEfficiencyScore` (base weight `35%`): `round(max(0, min(100, 100 - extraDistPct * 2.1)))` when `distanceReliable && baselineDistanceKm > 0`. Excluded (`weight = 0`) if distance is incomplete.
- `connectionSafetyScore` (base weight `25%`): Scaled by `effectiveLayoverWithP90Minutes / targetBufferMinutes`, capped at `35` for `HIGH_RISK` and `5` for `MISSED`.
- `historicalReliabilityScore` (base weight `20%`): Computed from 30-day median/P90 delay when all legs have `historicalDelayAtAlighing.available === true`; otherwise `null` and excluded (`weight = 0`).
- `journeyDurationScore` (base weight `15%`): `round(max(15, min(100, (baselineDuration / totalDuration) * 100)))`.
- `transferComplexityScore` (base weight `5%`): `100` for 1 transfer (2 legs), `55` for 2 transfers (3 legs), `20` for 3+ transfers.
- **Weight Renormalization**: Available weights are divided by `weightSum` so the active verified factors always sum to `1.0` (`100%`).

---

## 7. External Integrations & Environment Variables

RailPath India requires **zero environment variables** to run. `resolveRuntimeConfig()` in `server.ts` provides safe defaults:

| Variable | Required? | Default Value | Purpose |
| :--- | :--- | :--- | :--- |
| `RAILWAY_DATA_MODE` | Optional | `"demo"` | Runtime data mode (`demo` / schedule-verified local mode). |
| `RAILWAY_STATION_DATA_PATH` | Optional | `"data/Railway_stations.json"` | Custom path override for the station directory JSON file. |
| `RAPIDAPI_IRCTC_KEY` | Optional | `undefined` | Optional credential reported in `/api/providers/status` for future live API adapter. |
| `NTES_PARTNER_API_KEY` | Optional | `undefined` | Optional credential reported in `/api/providers/status` for future CRIS/NTES partner adapter. |
| `GEMINI_API_KEY` | Optional | Platform default | Listed in `.env.example` per platform template; **not used** by RailPath India (no AI/LLM features are present). |

---

## 8. Automated Testing Architecture (`src/lib/railpath.test.ts`)

- Executed via `npm test` (`npx --yes tsx --test src/lib/railpath.test.ts`).
- Contains **23 comprehensive test suites** testing:
  - Station dataset validation (`8,938` records, `18` zones, station disambiguation, ranked search).
  - Startup configuration without environment variables (`resolveRuntimeConfig`, `loadStationDataset`).
  - Nationwide timetable integrity (`5,058` trains, commercial halt validation, zero synthetic/mock trains).
  - Direct train search (`ROU → BSB`, `ROP → BPO`, `HWH → NDLS`, `MAS → BSB`).
  - Multi-route discovery (`ROU → BSB`, `ROU → BPO`, `ROP → ROU`, `MAS → BSB`).
  - All 12 railway distance calculation edge cases (origin-to-destination, intermediate boarding, intermediate alighting, intermediate-to-intermediate, 2-leg and 3-leg totals, candidate train distance ranges, missing-leg distance handling, non-monotonic stop distance quarantine, circular/loop trains with repeated station codes, lowest-distance sorting, and `+25%`/`+50%`/`+100%` detour filtering).
