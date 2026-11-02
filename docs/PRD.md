# RailPath India — Product Requirements Document (PRD)

**Document Version:** 1.0  
**Last Updated:** 2026-11-01  
**Project Status:** Active Working Application (Local Zero-Cost Schedule & Verified Distance Mode)

---

## 1. Product Vision

**RailPath India** is an intelligent, nationwide Indian Railways route discovery, multi-leg transfer planner, and connection-feasibility analysis web application. It enables passengers, rail enthusiasts, and transport planners to find both **direct trains** and **verified multi-train connecting routes** across the Indian railway network when direct trains are unavailable, waitlisted, or infrequent—without fabricating schedules, station sequences, railway distances, or punctuality telemetry.

---

## 2. Target Users

1. **Long-Distance & Regional Rail Passengers**
   - Passengers travelling between stations that lack daily direct connectivity (e.g., *Rupsa Junction `ROP` → Rourkela Junction `ROU`*, *Rourkela Junction `ROU` → Baripada `BPO`*) or where direct trains have limited frequency (e.g., *Rourkela Junction `ROU` → Varanasi Junction `BSB`*).
2. **Transfer-Conscious Travellers**
   - Families, senior citizens, and travellers carrying luggage who need configurable interchange layover buffers (`150m`, `180m`, `240m`, or custom minutes) and transparent transfer feasibility assessments before booking separate legs.
3. **Railway Planners & Operational Analysts**
   - Users auditing station connectivity across all 18 Indian Railway zones, comparing cumulative track distances across alternative junctions, or stress-testing transfer margins between an incoming train and an outgoing connecting train.

---

## 3. Problem Statement

Standard Indian railway booking portals focus primarily on direct point-to-point train availability or opaque single-interchange suggestions. Passengers face four recurring problems:
1. **Missing Connecting Route Discovery**: When a direct train does not exist between two stations—or operates only once or twice a week—passengers must manually guess junction stations (`KGP`, `TATA`, `MURI`, `RNC`, `BKSC`, `DHN`, `DDU`, `PRYJ`, `ET`, `BPQ`, etc.) and cross-check arrival and departure times across midnight boundaries.
2. **Unverified or Synthetic Data in Unofficial Tools**: Many third-party apps display estimated straight-line distances, unverified passing halts as commercial stops, or fabricated "on-time" badges when live or historical data is missing.
3. **Transfer Buffer Uncertainty**: A 25-minute scheduled layover on paper is rarely safe on long-distance Indian mail/express routes. Passengers need explicit control over target transfer buffers (`150m`, `180m`, `240m`) and clear differentiation between schedule-verified buffers and historical/live delay verification.
4. **Information Overload in Multi-Leg Results**: Listing every possible train combination for every junction simultaneously creates unreadable walls of text. Users need a structured step-by-step flow: **Search → Route Options Summary → Per-Leg Train Selection**.

---

## 4. Functional Requirements & Implementation Status

The table below clearly distinguishes **Currently Implemented & Verified Features** from **Partially Implemented (Offline/Manual Simulation)** and **Planned Future Features**.

| Feature Area | Current Status | Implementation Details & Honest Provenance |
| :--- | :--- | :--- |
| **1. Nationwide Indian Railway Station Search** | **Implemented & Verified** | Backed by `data/Railway_stations.json` (`8,938` validated station records across `18` railway zones, `0` missing fields, `0` duplicate station codes). Supports instant autocomplete by station code (`ROU`, `BSB`, `ROP`, `BPO`), station name, city aliases, and zone filtering (`/api/stations/search` and `/api/stations/audit`). |
| **2. Direct Train Search** | **Implemented & Verified** | Queries `5,058` trains in `data/nationwide_timetable.json` (`100,694` commercial stop entries). Enforces exact station code matching, stop sequence ordering (`originStopSequence < destinationStopSequence`), commercial halt verification (`arrival !== departure` at intermediate stops), and calendar date / day-offset validation (`/api/trains/direct`). |
| **3. Automatic Multi-Route Discovery** | **Implemented & Verified** | Time-dependent graph search (`findMultiRoutes` in `src/lib/routingEngine.ts`) discovering verified 2-leg (`1` transfer) and 3-leg (`2` transfers) routes across the nationwide timetable. Prunes cycles, enforces minimum physical transfer margins, and groups routes by detour percentage relative to the shortest verified rail baseline (`/api/routes/multi`). |
| **4. Three-Step Planner Navigation & Per-Leg Train Selection** | **Implemented & Verified** | Dedicated 3-screen flow inside the Route Planner (`Search Screen` → `Route Results Screen` → `Train Options Screen`), synchronized with browser History API (`pushState`/`popstate`) and `sessionStorage`. Users can select any verified candidate train for Leg 1, Leg 2, or Leg 3 and dynamically recalculate total journey duration, layover time, verified distance, and recommendation score (`/api/routes/evaluate`). |
| **5. Transfer Feasibility Evaluation** | **Implemented (Schedule-Verified + Manual Delay Stress-Testing)** | Evaluates exact calendar arrival/departure dates across midnight crossings, enforces minimum platform transfer margin (`15m` same station, `45m` interstation), and compares layover against user target buffer (`150m`/`180m`/`240m`/custom). Never marks a connection `"Comfortable connection"` (`SAFE`) without historical delay data; explicitly labels schedule-only evaluations as `"Meets scheduled buffer (delay history unavailable)"`. |
| **6. Railway Distance Calculations** | **Implemented & Verified (`90.37%` trains / `79.83%` stops)** | Uses `data/verified_stop_distances.json` (derived from OGD India `data.gov.in` Ministry of Railways timetable via `raildb.sqlite` under MIT/GODL-India + DataMeet CC0 track graph). Computes `segmentDistanceKm = destinationCumulativeKm - originCumulativeKm`. Never uses Haversine straight-line distance. Explicitly reports `"Distance incomplete — distance data unavailable for one leg"` for the remaining `487` trains (`9.63%`) lacking verified intermediate stop distances. |
| **7. Transparent Route Recommendation Engine** | **Implemented & Verified** | 100-point scoring engine (`calculateRecommendationScore`) combining Distance Efficiency (`35%`), Connection Safety (`25%`), Historical Reliability (`20%`), Journey Duration (`15%`), and Transfer Complexity (`5%`). Automatically excludes missing factors (such as unavailable historical delay data or incomplete leg distance) and renormalizes weights over verified factors only. |
| **8. Live Train Status** | **Implemented (Offline Schedule + What-If Delay Simulator) / Planned (Live External API)** | Displays full ordered station timeline from `data/nationwide_timetable.json` with an interactive manual delay slider (`0` to `360` minutes) to simulate delay propagation (`/api/trains/:trainNumber/live`). Real-time GPS/NTES telemetry is explicitly marked **`UNAVAILABLE_OFFLINE_MODE`** under the ₹0 API budget. |
| **9. Two-Train Connection Comparison** | **Implemented (Schedule + Manual Delay Stress-Tester) / Planned (Live External Feed)** | Automatically detects shared interchange stations between any two trains (`compareTwoTrainsLive` via `/api/trains/compare`), computes scheduled layover, and lets users stress-test incoming and outgoing train delays (`-30m` to `+360m`) against their target buffer. |
| **10. Mobile & Desktop Support** | **Implemented (Functional Responsive Layout) / Planned (Phase 6–7 Classical Redesign)** | Responsive desktop top navigation bar and mobile sticky bottom navigation bar (`375×812` and `1440×900` verified). A dedicated classical, minimal visual refinement is planned for Phase 6 & Phase 7. |

---

## 5. Non-Functional Requirements

1. **Zero Data Fabrication & Provenance Honesty**
   - The application must never invent train numbers, train names, station halts, departure/arrival times, cumulative track distances, historical punctuality statistics, or live running status.
   - Any unavailable data (e.g., live GPS feed in ₹0 budget mode, historical 30-day delay observations, or the `9.63%` of trains without verified intermediate stop kilometres) must be explicitly labelled in both API responses and UI components.
2. **Zero-Cost (`₹0`) Local Execution**
   - The application must start and run with full station search, direct train search, multi-route discovery, verified distance calculation, and manual delay stress-testing without requiring any external API keys or paid environment variables.
3. **Strict Station Disambiguation**
   - Every Indian Railways station code (`ROU`, `ROP`, `BPO`, `BSB`, `DDU`, `KGP`, `TATA`) is treated as a unique physical identifier. Shared city names (e.g., Varanasi `BSB` vs `BSBS` vs `BCY` vs `DDU`) are never conflated.
4. **Performance & Startup Reliability**
   - Server startup (`server.ts`) opens port `3000` immediately and warms up the `8,938`-station directory, `5,058`-train timetable, `verified_stop_distances.json`, and in-memory `RailwayRouteGraph` asynchronously via `setImmediate`.
   - Route search queries execute against pre-indexed in-memory maps (`trainsAtStation`, `stopIndicesByStationAndTrain`, `corridorEdgeKm`) in sub-second response times.
5. **Testability**
   - Pure domain logic in `src/lib/stationSearch.ts`, `src/lib/routingEngine.ts`, and `src/data/railwayDataset.ts` must remain decoupled from React components and verified via automated `node:test` suites (`npm test`).

---

## 6. Acceptance Criteria

1. **Station Directory Audit**: `/api/stations/audit` reports `8,938` total records, `8,938` unique codes, `18` railway zones, and status `VALIDATED`.
2. **Direct Train Accuracy**: Searching `ROU → BSB` returns verified direct train `18311` (`745 km`, `VERIFIED_TIMETABLE_CUMULATIVE_KM`). Searching `ROU → BPO` or `ROP → ROU` returns `0` direct trains and automatically surfaces verified connecting routes.
3. **Connecting Route & Distance Accuracy**:
   - `ROU → BSB` surfaces verified connecting routes including `ROU → MURI → BSB` (`709 km`: `236 km + 473 km`), `ROU → BKSC → BSB` (`712 km`), `ROU → RNC → BSB` (`713 km`), `ROU → TATA → BSB` (`735 km`), and `ROU → DHN → BSB` (`756 km`).
   - `ROU → BPO` surfaces `ROU → KGP → BPO` (`449 km`: `297 km + 152 km`).
   - `ROP → ROU` surfaces `ROP → KGP → ROU` (`397 km`: `100 km + 297 km`).
   - `MAS → BSB` surfaces direct train `12669` (`2,136 km`) and connecting routes such as `MAS → PRYJ → BSB` (`2,107 km`).
4. **Dynamic Train Re-selection**: Changing a candidate train on any leg in the Train Options screen immediately updates that leg's departure/arrival times, verified stop distance, total route distance, transfer wait time, and recommendation score.
5. **Quarantine & Missing-Distance Honesty**: Non-monotonic stop distance sequences or trains with missing intermediate stop distances return `distanceReliable: false` and display `"Distance incomplete — distance data unavailable for one leg"` rather than partial sums or geographic estimates.
