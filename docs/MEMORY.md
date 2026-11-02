# RailPath India — Project Memory & Engineering Log (`MEMORY.md`)

> **MANDATORY INSTRUCTION FOR ALL FUTURE DEVELOPMENT SESSIONS:**  
> **You MUST read this `docs/MEMORY.md` file (alongside `docs/RULES.md` and `docs/PHASES.md`) BEFORE starting any new development task, bug fix, or UI change, and you MUST update `docs/MEMORY.md` after every completed phase or significant modification.**

**Last Updated:** 2026-11-01  
**Current Application Status:** Stable, Verified & Running on Port `3000` (`ZERO_COST_LOCAL_MODE`)

---

## 1. Current Project Status & Verified Dataset Metrics

Rechecked directly against the actual files in `data/` and `src/` on **2026-11-01**:

1. **Station Directory (`data/Railway_stations.json`)**:
   - **Total Validated Stations**: `8,938` records (`8,938` unique station codes, `0` duplicate codes, `0` missing fields).
   - **Zones Covered**: `18` railway zones (`NR`, `SCR`, `ECR`, `SR`, `WR`, `NWR`, `ER`, `NFR`, `NER`, `CR`, `NCR`, `SWR`, `SER`, `ECOR`, `SECR`, `WCR`, `KR`, `BR`).
   - **Shared Station Names Disambiguated**: `69` shared names across zones/cities.

2. **Nationwide Train Timetable (`data/nationwide_timetable.json`)**:
   - **Source**: DataMeet Indian Railways dataset (`schedules.json` + `trains.json`, CC0 1.0 Public Domain).
   - **Total Trains**: `5,058` verified commercial passenger trains.
   - **Total Stop Entries**: `100,694` stops (`90,578` intermediate stops; `10,116` origin/destination endpoints).
   - **Overall Train Distance (`dist`)**: Present on `5,027 / 5,058` trains (`99.39%`); missing (`dist: null`) on `31` trains.

3. **Verified Per-Stop Cumulative Railway Distances (`data/verified_stop_distances.json` & `data/distance_quality_report.json`)**:
   - **Enrichment Source**: `arshadkazmi42/offline-train-time-table` (`assets/raildb.sqlite`, **MIT License**, packaging Government of India Open Data Platform `data.gov.in` Ministry of Railways timetable under **GODL-India**) + verified directed railway track-graph edges (`14,757` edges across `5,637` stations).
   - **Total Stops with Verified Cumulative Distance (`km`)**: **`80,382 / 100,694` (`79.83%`)** — increased from `10,085` (`10.02%`).
   - **Intermediate Stops with Verified Cumulative Distance (`km`)**: **`70,288 / 90,578` (`77.60%`)** — increased from `0` (`0.00%`).
   - **Trains with Verified Intermediate Stop Distances**: **`4,571 / 5,058` (`90.37%`)** (`2,621` `VERIFIED_COMPLETE` [`51.82%`] + `1,950` `VERIFIED_PARTIAL` [`38.55%`]).
   - **Trains Lacking Verified Intermediate Stop Distances**: **`487 / 5,058` (`9.63%`)** (`468` `ENDPOINT_ONLY` + `19` `UNVERIFIED`, including the `31` trains with `dist: null`).
   - **Quarantined Non-Monotonic `raildb.sqlite` Trains**: `107` slip-coach/bifurcated trains quarantined from raw import unless reconciled monotonically via the verified track graph.

---

## 2. Strict Data Provenance Classification

| Data Category | Current Status in RailPath India | How It Is Handled in Code & UI |
| :--- | :--- | :--- |
| **Verified Train Timetable Data** | **Active (`5,058` trains / `100,694` stops)** | Loaded from `data/nationwide_timetable.json`. Every leg is verified via `verifyTrainLegAgainstTimetable()` for stop order (`fromIdx < toIdx`), commercial halt (`arrival !== departure`), and operating day. |
| **Verified Railway Distance Data** | **Active (`4,571` trains [`90.37%`] / `80,382` stops [`79.83%`])** | Loaded from `data/verified_stop_distances.json`. Segment distance is computed as `toStop.distanceKm - fromStop.distanceKm` (`VERIFIED_TIMETABLE_CUMULATIVE_KM`) or verified adjacent track edges (`CORRIDOR_VERIFIED_TIMETABLE_KM`). |
| **Missing Distance Data (`9.63%` of trains)** | **Explicitly Flagged (`487` trains)** | When a leg uses an unverified intermediate stop on one of the `487` trains, `distanceReliable` is set to `false`, `totalDistanceKm` is set to `0`, the UI displays `"Distance incomplete — distance data unavailable for one leg"`, and the distance factor is excluded from the recommendation score. |
| **Historical Delay / Punctuality Data** | **Unavailable in ₹0 Offline Mode** | `makeUnavailableDelayStats()` sets `available: false` and `source: 'UNAVAILABLE'`. Connections are labelled `"Meets scheduled buffer (delay history unavailable)"` (never `"Comfortable connection"`), and the `20%` reliability weight is excluded and renormalized. |
| **Live Train Running Status** | **Unavailable in ₹0 Offline Mode (Manual Simulator Active)** | `/api/providers/status` reports `UNAVAILABLE_OFFLINE_MODE`. `LiveStatusView` and `CompareTrainsView` display scheduled timetable stops with an explicit manual delay slider (`0m` to `360m`) for what-if connection stress-testing. |

---

## 3. Existing Implemented Features

1. **Zero-Config Server Startup (`server.ts`)**: Starts on port `3000` with zero required environment variables or API keys; defaults `RAILWAY_DATA_MODE` to `"demo"`.
2. **Station Search & Audit (`src/lib/stationSearch.ts`, `StationSelector.tsx`, `StationAuditModal.tsx`)**: Instant autocomplete across `8,938` stations, disambiguation of `69` shared station names, and full zone/category audit view.
3. **Direct Train Search (`findDirectTrains`, `DirectTrainsView.tsx`)**: Finds verified point-to-point services with intermediate stop counts, verified cumulative distance, and expandable stop-by-stop schedules.
4. **Automatic Multi-Route Discovery (`findMultiRoutes`, `MultiRoutesView.tsx`)**: Discovers 2-leg and 3-leg connecting routes across India, grouped by detour percentage (`≤10%`, `10–25%`, `>25%`) relative to the shortest verified rail baseline.
5. **Three-Screen Planner Flow (`src/App.tsx`)**:
   - Screen 1: Dedicated Search Screen (`?screen=search`)
   - Screen 2: Dedicated Route Results Screen (`?screen=results`)
   - Screen 3: Dedicated Train Options Screen (`?screen=train-options&routeId=...`)
   - Full browser Back/Forward (`popstate`) and `sessionStorage` state preservation.
6. **Dynamic Per-Leg Train Selection (`evaluateCustomLegSelection`)**: Selecting any candidate train on Leg 1, Leg 2, or Leg 3 dynamically updates leg distance, total route distance, layover time, transfer feasibility, and recommendation score.
7. **Live Schedule Timeline & Two-Train Comparison (`LiveStatusView.tsx`, `CompareTrainsView.tsx`)**: Schedule-based stop progression and shared-interchange connection stress-testing under manual delay overrides.

---

## 4. Important Technical Decisions Log

1. **Why `prasenjit-27/Indian-Railway-Data` Was Rejected for Stop Distances**:
   - Audited `trains.json` (`5,208` trains, `416,637` stops): `100%` of stop records had `"distance": 0` (`0` stops had `distance > 0`).
2. **Why `KoyenaChowdhury/RSTGCN` Was Not Redistributed**:
   - Contains accurate stop distances (`3,892` trains), but its GitHub repository has `license: null` (academic paper dataset without an open-source license). Excluded to strictly honor open-licensing rules.
3. **Why `arshadkazmi42/offline-train-time-table` (`raildb.sqlite`) Was Selected**:
   - Released under the **MIT License** and packages the Government of India Open Data (`data.gov.in`) Ministry of Railways Train Time Table (**GODL-India**), providing verified integer cumulative distances across all 18 railway zones.
4. **Support for Circular / Loop Trains**:
   - `148` trains visit the same station code more than once. `buildNationwideTrainServices()` only rejects *consecutive* duplicate stops (`prevCode === currCode`), and `getRouteGraph()` stores an array of stop indices per `(stationCode, trainNumber)` in `stopIndicesByStationAndTrain`.
5. **Strict Quarantine of Non-Monotonic Stop Distances**:
   - Both `buildNationwideTrainServices()` and `calculateVerifiedLegDistance()` verify that cumulative stop kilometres strictly increase along the stop sequence and agree with `train.dist` within `max(15 km, 5%)`. Any violation quarantines the segment distance immediately.
6. **Nationwide False-Interchange & Bypass-Chord Reversal Fix (`ROU → UD` / `SRR` vs `TCR`/`OTP`)**:
   - **Root Cause**: In the legacy DataMeet `schedules.json` snapshot, `16` through-trains between the Palakkad branch (`CBE`, `PGT`, `OTP`) and the Thrissur branch (`WKI`, `TCR`, `AWY`, `ERS`, `ERN`)—including `13351` (`DHANBAD - ALAPPUZHA Exp`) and its coupled link schedule `18189` (`Tatanagar - Alappuzha Express`)—contained a 15-minute operational locomotive-reversal entry at `SRR` (`Shoranur Junction`). On the Southern Railway network, through trains between Palakkad and Thrissur use the **Shoranur 'B' Cabin triangular bypass chord** and do not make a commercial passenger halt inside Shoranur Junction (`SRR`), stopping commercially only at nearby stations (`OTP`, `WKI`, `TCR`, `PGT`). Additionally, southbound trains `13351`/`18189` connected to northbound Konkan trains (`16312`, `16334`, `19259`) coming from `ERN -> AWY -> TCR -> SRR`, which had only 1–2 shared stops with `13351`'s post-interchange segment (`TCR -> AWY -> ERS`) and bypassed the previous `>= 3` opposite-trunk stop threshold.
   - **Fix**:
     1. `buildNationwideTrainServices()` filters out non-commercial Shoranur 'B' Cabin bypass-chord technical reversal entries (`SRR` immediately between `{CBE, PGT, OTP}` and `{WKI, TCR, AWY, ERS, ERN}`) after aligning verified per-stop distances (`validatedKms`), so `13351` and `18189` retain their verified distances while no longer falsely advertising `ROU → SRR`.
     2. `getRouteGraph()` indexes `corridorBridgeMap` (registering the Shoranur triangular junction bridge `{CBE, PGT, OTP} <-> {WKI, TCR, AWY, ERS, ERN}` via `SRR` and the Western Railway trunk bridge `BRC <-> BSR` via `ST`/`BH`), and `hasBacktrackingBetweenLegs()` rejects any transfer that overshoots a junction and reverses back across a bridged corridor node (eliminating `ROU → SRR → UD`, `ROU → TCR → UD`, and `ROU → BRC → UD`).
     3. Added `areStationsStrictlyIdentical()`, `validateTrainLegWithReason()`, `validateMultiRouteCandidate()`, coupled `-Slip` deduplication, and full `traceableSourceRecord` audit fields on every direct and connecting leg.

---

## 5. Known Limitations

1. **`487 / 5,058` Trains (`9.63%`) Lack Verified Intermediate Stop Distances**:
   - Because `raildb.sqlite` has `2,810` trains while DataMeet `nationwide_timetable.json` has `5,058` trains, `487` trains (mostly regional passenger/MEMU/DEMU services or trains with `dist: null` in DataMeet) do not have complete intermediate stop mappings in the verified track graph. These legs are honestly marked unavailable (`distanceReliable: false`) rather than estimated.
2. **Static Operating Days in DataMeet Timetable**:
   - DataMeet's raw `schedules.json` does not include per-train weekly operating-day bitmasks (`operatingDaysAvailable: false` at dataset level), so trains default to daily (`Mon–Sun`) unless enriched in future timetable snapshots.
3. **Offline Live & Historical Telemetry in ₹0 Budget Mode**:
   - Real-time train running delays and 30-day historical punctuality percentiles require external telemetry feeds not available in `₹0` local mode.

---

## 6. Completed Development Phases & Current Testing Status

- **Completed Phases**:
  - **Phase 1**: Existing Application Audit & Stabilization
  - **Phase 2**: Railway Data Quality & Nationwide Route Discovery
  - **Phase 3**: Direct & Connecting Train Accuracy
  - **Phase 4**: Railway Distance & Recommendation Accuracy
  - **Phase 5**: Search, Results & Train-Selection Navigation
  - **Nationwide Route Validation & False-Interchange Audit (`ROU → UD` Fix)**
- **Current Automated Test Status (`src/lib/railpath.test.ts`)**:
  - **Command**: `npm test` (`npx --yes tsx --test src/lib/railpath.test.ts`)
  - **Result**: **`24 / 24` test suites passing (`0` failures)**, covering station search, strict station identity (`ROU ≠ SRR`, `SRR ≠ TCR`, `SRR ≠ OTP`), timetable integrity, direct search, multi-route search, all 12 distance calculation edge cases, and real corridor searches (`ROU → UD`, `ROU → BSB`, `ROU → BPO`, `ROP → ROU`, `MAS → BSB`).
  - **TypeScript Check**: `npm run lint` (`tsc --noEmit`) passing with **`0` errors**.
  - **Production Build**: `npm run build` (`vite build`) succeeding cleanly.

---

## 7. Next Recommended Task

- **Phase 6 (Classical, Professional & Minimal UI Redesign)** and **Phase 7 (Mobile Responsiveness & Accessibility Polish)**:
  - Apply the visual specifications defined in `docs/DESIGN.md` to refine typography, card density, spacing, and visual hierarchy across `DirectTrainsView.tsx`, `MultiRoutesView.tsx`, `LiveStatusView.tsx`, `CompareTrainsView.tsx`, and `StationAuditModal.tsx` without altering any underlying routing, distance, or navigation logic.

