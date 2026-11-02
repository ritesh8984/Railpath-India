# RailPath India — Engineering & Data Integrity Rules (`RULES.md`)

**Document Version:** 1.0  
**Last Updated:** 2026-11-01  
**Enforcement Level:** Mandatory for all developers and automated coding sessions working on RailPath India.

---

## 1. Preserve All Existing Working Features
- Every existing working capability—including the `8,938`-station directory, station autocomplete, audit modal, direct train search, 2-leg and 3-leg connecting route discovery, 3-step planner flow (`Search → Results → Train Options`), browser Back/Forward history integration, verified stop distance calculations, live status schedule timeline, and two-train connection comparison—must remain intact and functional across every change.

## 2. Never Rewrite the Entire Project Unnecessarily
- Do not replace working modules, restructure the repository layout, or rewrite `src/App.tsx`, `src/lib/routingEngine.ts`, or `server.ts` from scratch when a targeted, surgical edit can solve the requirement.

## 3. Inspect Relevant Source Files Before Changing Them
- Always read and inspect the actual source files, data schemas, TypeScript interfaces (`src/types/railway.ts`), and `docs/MEMORY.md` before proposing or applying any code modification.

## 4. Make Small, Isolated Changes
- Implement features, bug fixes, and UI refinements in small, independently verifiable stages so regressions can be immediately identified and isolated.

## 5. Never Fabricate Railway Information
- **Strict Zero-Fabrication Policy**: Never invent, hardcode, or synthesize:
  - Train numbers or train names.
  - Station stop sequences or unverified commercial halts.
  - Arrival times, departure times, halt durations, or operating days.
  - Per-stop or overall railway distances (`km`).
  - Historical 30-day delay statistics (`medianDelayMinutes`, `p90DelayMinutes`).
  - Live train running status, current station position, or platform numbers.

## 6. Never Represent Demo or Simulated Information as Verified Railway Information
- Any interactive simulation tool (such as the manual delay stress-tester in `LiveStatusView` and `CompareTrainsView`) must be explicitly badged as schedule-based simulation (`SCHEDULE_ONLY` / manual delay stress-testing).
- Never label a transfer connection as `"Comfortable connection"` (`SAFE`) when historical delay data is unavailable; always use the honest status `"Meets scheduled buffer (delay history unavailable)"`.

## 7. Never Calculate Railway Distance Using Straight-Line Geographical Distance
- **No Haversine / Great-Circle Estimates**: Railway track distance between two stations must never be estimated from latitude/longitude coordinates or straight-line multipliers.
- Every leg distance must be derived strictly from verified cumulative train-stop distances (`destinationCumulativeKm - originCumulativeKm`) or verified adjacent railway corridor timetable edges.
- If a train's stop distance sequence is non-monotonic or conflicts with the train's overall distance (`dist`), quarantine the distance immediately as unavailable (`distanceReliable: false`).

## 8. Preserve Exact Indian Railway Station Codes
- Treat every Indian Railways station code as a unique, immutable physical station identifier:
  - `ROU` = Rourkela Junction (`SER`)
  - `ROP` = Rupsa Junction (`SER`)
  - `BPO` = Baripada (`SER`)
  - `BSB` = Varanasi Junction (`NR`)
  - `DDU` = Pt. Deen Dayal Upadhyaya Junction (`ECR`)
- Never confuse similar codes, never substitute a nearby station silently, and never treat separate physical stations in the same city (e.g., `BSB`, `BSBS`, `BCY`, `DDU`) as a same-station transfer without an explicit interstation transit warning.

## 9. Keep API Integrations Optional Whenever Possible
- The application must never block startup, show mandatory API-key popups, or crash when external API environment variables (`RAPIDAPI_IRCTC_KEY`, `NTES_PARTNER_API_KEY`, `RAILWAY_DATA_MODE`, `RAILWAY_STATION_DATA_PATH`) are unset.

## 10. Respect the ₹0 Railway API Budget
- All core features (station directory, direct train search, multi-route discovery, per-stop distance verification, transfer buffer analysis, and recommendation scoring) must run 100% locally at `₹0` cost using legitimately reusable open datasets (`data/Railway_stations.json`, `data/nationwide_timetable.json`, `data/verified_stop_distances.json`).

## 11. Use Reusable Components and Maintainable Code
- Keep pure railway domain logic (`src/lib/stationSearch.ts`, `src/lib/routingEngine.ts`, `src/data/railwayDataset.ts`) cleanly separated from React presentation components (`src/components/*`).
- Enforce strong TypeScript typing (`npm run lint` / `tsc --noEmit` must pass with `0` errors).

## 12. Handle Missing Data Honestly
- When a route has one or more legs without verified stop distances (applicable to the `487` trains / `9.63%` in `data/nationwide_timetable.json` lacking verified intermediate stop kilometres), never display a partial sum as the total route distance. Display `"Distance incomplete — distance data unavailable for one leg"` and exclude the distance factor from the recommendation score.
- When historical delay data is unavailable, exclude the `20%` reliability weight and renormalize the remaining verified weights to `100%`.

## 13. Test Affected Features After Every Meaningful Change
- Run the automated unit and integration test suite (`npm test` → `src/lib/railpath.test.ts`), TypeScript typecheck (`npm run lint`), and production build verification (`npm run build`) after every code or dataset change.

## 14. Avoid Unnecessary Dependencies and Expensive Operations
- Do not install heavy third-party libraries when standard TypeScript, React hooks, Tailwind CSS utilities, or Node.js built-in modules suffice.
- Pre-index timetable lookup maps once in `getRouteGraph()` rather than scanning `100,694` stops repeatedly on every render or API call.

## 15. Do Not Change Unrelated Components
- Restrict every pull request or implementation task strictly to the files and components required by the user's current specification. Do not alter unrelated views, datasets, or configuration files.
