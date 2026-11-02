# RailPath India — Development Roadmap & Phase Status (`PHASES.md`)

**Document Version:** 1.0  
**Last Updated:** 2026-11-01  
**Evaluation Basis:** Strictly grounded in actual codebase evidence, dataset audits (`data/distance_quality_report.json`), and passing automated tests (`src/lib/railpath.test.ts`).

---

## Summary of Phases

| Phase | Title | Status | Evidence Summary |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Existing Application Audit & Stabilization | **Completed** | Startup requires zero env vars; `data/Railway_stations.json` (`8,938` stations across `18` zones) audited & validated; `server.ts` runs cleanly on port `3000`. |
| **Phase 2** | Railway Data Quality & Nationwide Route Discovery | **Completed** | `data/nationwide_timetable.json` (`5,058` DataMeet CC0 trains, `100,694` stops) imported; mock/synthetic corridors removed; nationwide 2-leg & 3-leg graph discovery active. |
| **Phase 3** | Direct & Connecting Train Accuracy | **Completed** | Strict station-code identity, commercial halt verification (`arrival !== departure`), stop-index ordering (`fromIdx < toIdx`), circular/loop train support, and calendar day-offset checks enforced. |
| **Phase 4** | Railway Distance & Recommendation Accuracy | **Completed (with `9.63%` dataset gap documented)** | `data/verified_stop_distances.json` enriches `4,571 / 5,058` trains (`90.37%`) and `80,382 / 100,694` stops (`79.83%`); non-monotonic sequences quarantined; recommendation weights renormalize honestly. |
| **Phase 5** | Search, Results & Train-Selection Navigation | **Completed** | Dedicated 3-screen flow (`Search` → `Results` → `Train Options`) implemented in `src/App.tsx` and `src/components/MultiRoutesView.tsx` with URL query & browser History (`popstate`) sync. |
| **Phase 6** | Classical, Professional & Minimal UI Redesign | **Partially Completed / Pending Full Visual Pass** | Top bar contract, compact route summary cards, and clean slate/railway-blue hierarchy are in place, but a dedicated classical/minimal visual polish pass across all secondary views (`DirectTrainsView`, `LiveStatusView`, `CompareTrainsView`, `StationAuditModal`) remains planned. |
| **Phase 7** | Mobile Responsiveness & Accessibility | **Partially Completed** | Mobile bottom navigation bar, `48px` touch targets on search inputs, keyboard-navigable `StationSelector`, and `prefers-reduced-motion` support exist; comprehensive WCAG AA contrast/ARIA audit and mobile card density refinement remain planned. |
| **Phase 8** | Live Railway Data Integration Using Legitimate Sources | **Pending (Currently Offline Schedule + Manual Simulator)** | Adapter status endpoint (`/api/providers/status`) and manual delay stress-testing sliders exist, but real-time external API telemetry is not connected under the ₹0 API budget. |
| **Phase 9** | Testing, Security & Performance | **Partially Completed** | `23` unit/integration test suites in `src/lib/railpath.test.ts` pass (`100%`), `tsc --noEmit` passes, and in-memory graph caching is active; API rate limiting, HTTP security headers, and E2E browser regression scripts remain planned. |
| **Phase 10** | Deployment & Final Verification | **Pending** | Production build (`vite build`) and `npm start` (`node server.ts`) are configured; final post-redesign production verification and deployment sign-off remain pending completion of Phases 6–9. |

---

## Detailed Phase Breakdown

### Phase 1: Existing Application Audit and Stabilization — **COMPLETED**
- **Completed Tasks**:
  - Audited and validated `data/Railway_stations.json` (`8,938` records, `8,938` unique station codes, `18` railway zones, `0` missing fields, `69` disambiguated shared station names).
  - Removed blocking environment-variable requirements in `server.ts` (`resolveRuntimeConfig()` defaults `RAILWAY_DATA_MODE` to `"demo"` and resolves `data/Railway_stations.json` via relative path).
  - Implemented ranked station autocomplete (`src/lib/stationSearch.ts` + `src/components/StationSelector.tsx`) matching exact station codes first, then code prefixes, station name prefixes, and curated city aliases.

### Phase 2: Railway Data Quality and Nationwide Route Discovery — **COMPLETED**
- **Completed Tasks**:
  - Built `scripts/buildNationwideTimetable.cjs` to import DataMeet's CC0 `schedules.json` and `trains.json` into `data/nationwide_timetable.json` (`5,058` trains, `100,694` stops).
  - Removed all hardcoded/synthetic demo routes (`ROU → BSB` mock fallbacks) from `src/data/railwayDataset.ts` and `src/lib/routingEngine.ts`.
  - Built in-memory `RailwayRouteGraph` (`getRouteGraph()`) indexing `3,925+` active timetable stations across India for nationwide 2-leg and 3-leg route discovery.

### Phase 3: Direct and Connecting Train Accuracy — **COMPLETED**
- **Completed Tasks**:
  - Implemented `verifyTrainLegAgainstTimetable()` and `isCommercialTrainStop()` in `src/lib/routingEngine.ts` so every direct train and connecting leg is cross-checked against the raw timetable stop sequence.
  - Enforced strict station code identity (`ROU` vs `ROP` vs `BPO`, `BSB` vs `DDU`).
  - Added support for circular/loop trains visiting the same station code twice (`stopIndicesByStationAndTrain`).
  - Verified exact calendar date transitions across midnight (`dayOffset`) and layover bounds (`15m` minimum physical margin up to `24h` maximum layover).

### Phase 4: Railway Distance and Recommendation Accuracy — **COMPLETED (with Known Dataset Boundary)**
- **Completed Tasks**:
  - Audited `data/nationwide_timetable.json` (`0%` intermediate stop distance coverage in raw DataMeet schedules) and evaluated three candidate open datasets (`prasenjit-27/Indian-Railway-Data`, `KoyenaChowdhury/RSTGCN`, and `arshadkazmi42/offline-train-time-table`).
  - Built `scripts/buildVerifiedStopDistances.cjs` using MIT/GODL-India licensed `raildb.sqlite` (`data.gov.in` Ministry of Railways timetable) + verified adjacent track-graph edges to generate `data/verified_stop_distances.json` and `data/distance_quality_report.json`.
  - Achieved **`90.37%` train coverage** (`4,571 / 5,058` trains) and **`79.83%` stop coverage** (`80,382 / 100,694` total stops; `70,288 / 90,578` intermediate stops [`77.60%`]).
  - Implemented strict monotonicity and overall-distance agreement checks in `buildNationwideTrainServices()` and `calculateVerifiedLegDistance()`.
  - Updated `calculateRecommendationScore()` to exclude missing factors (historical delay or incomplete distance) and renormalize weights over verified data only.
- **Remaining Known Boundary**:
  - `487 / 5,058` trains (`9.63%`) lack verified intermediate stop distances and are honestly reported as `"Distance incomplete — distance data unavailable for one leg"` when used on intermediate segments.

### Phase 5: Search, Results and Train-Selection Navigation — **COMPLETED**
- **Completed Tasks**:
  - Separated the Route Planner into three distinct screens in `src/App.tsx`:
    1. `plannerStep === 'search'` (Search Screen)
    2. `plannerStep === 'results'` (Route Results Screen with compact Route Option Summary Cards)
    3. `plannerStep === 'train-options'` (Dedicated Per-Leg Train Selection Screen for a chosen route)
  - Synchronized screen transitions with URL query parameters (`?screen=...&routeId=...`), `window.history.pushState`/`popstate`, and `sessionStorage`.
  - Implemented dynamic per-leg train switching with instant recalculation of total duration, transfer wait time, verified distance, and recommendation score.

### Phase 6: Classical, Professional and Minimal UI Redesign — **PARTIALLY COMPLETED / PENDING**
- **Completed Foundation**:
  - Clean white/slate-50 surfaces, deep railway blue (`#1E3A8A` / `blue-900` / `blue-950`) primary accent, `Plus Jakarta Sans` + `JetBrains Mono` typography, and streamlined 3-zone header in `src/App.tsx`.
- **Pending Tasks**:
  - Execute a cohesive classical, minimal design refinement across all secondary screens (`DirectTrainsView.tsx`, `LiveStatusView.tsx`, `CompareTrainsView.tsx`, `StationAuditModal.tsx`) and route/train cards per `docs/DESIGN.md`, stripping remaining visual clutter, excessive badges, and redundant borders.

### Phase 7: Mobile Responsiveness and Accessibility — **PARTIALLY COMPLETED**
- **Completed Foundation**:
  - Sticky mobile bottom navigation bar (`src/App.tsx`), `min-h-[48px]` form controls, keyboard arrow/Enter/Escape navigation in `StationSelector.tsx`, and `prefers-reduced-motion` media query in `src/index.css`.
- **Pending Tasks**:
  - Conduct full mobile viewport (`375px` width) typography and spacing audit across `CompareTrainsView`, `LiveStatusView`, and `StationAuditModal`.
  - Complete ARIA live-region announcements and focus-management audit when transitioning between `Search`, `Results`, and `Train Options`.

### Phase 8: Live Railway Data Integration Using Legitimate Available Sources — **PENDING**
- **Current State**:
  - `LiveStatusView.tsx` and `CompareTrainsView.tsx` operate in offline schedule mode with an interactive manual delay slider (`0m` to `360m`). `/api/providers/status` honestly reports `UNAVAILABLE_OFFLINE_MODE` for live running status and historical reliability.
- **Pending Tasks**:
  - Design and wire optional, zero-cost-compatible or user-authorized live/historical provider adapters in `server.ts` if a legitimate free/open telemetry feed becomes available, while keeping offline schedule mode as the default fallback.

### Phase 9: Testing, Security and Performance — **PARTIALLY COMPLETED**
- **Completed Tasks**:
  - `23 / 23` automated unit and integration test suites in `src/lib/railpath.test.ts` passing (`stationSearch`, `routingEngine`, `railwayDataset`, 12 distance edge cases, and 4 real corridors `ROU → BSB`, `ROU → BPO`, `ROP → ROU`, `MAS → BSB`).
  - Zero TypeScript errors (`npm run lint`).
- **Pending Tasks**:
  - Add input sanitization/rate-limiting middleware on Express API routes in `server.ts` and automated Playwright browser E2E checks for the 3-screen navigation flow.

### Phase 10: Deployment and Final Verification — **PENDING**
- **Pending Tasks**:
  - Full production build (`npm run build`) and production server (`npm start`) verification after Phases 6–9 are completed.
