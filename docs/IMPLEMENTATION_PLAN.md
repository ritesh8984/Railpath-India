# RailPath India — Implementation Plan & Station Dataset Audit

## 1. Executive Summary
**RailPath India** is an intelligent Indian Railway route-finding, multi-train connection discovery, historical delay analysis, and live connection monitoring system. It solves a real operational pain point for Indian rail passengers (such as travelling from **Rourkela Junction `ROU`** to **Varanasi Junction `BSB`**): instead of forcing the traveller to manually search intermediate junctions (`RNC`, `HTE`, `TATA`, `DHN`, `GAYA`, `DDU`, `MURI`, `BKSC`, `PCOI`), compare rail distances, and guess transfer risks, RailPath India automates the entire discovery and safety assessment in a single search.

---

## 2. Station Dataset Audit Report (`data/Railway_stations.json`)

Before implementing the application, the user-supplied station directory (`/public/assets/aistudio/Railway_stations_5ba03751.json`, preserved at `/data/Railway_stations.json`) was inspected and audited programmatically:

| Metric | Verified Result | Notes |
| :--- | :--- | :--- |
| **Total Station Records** | `8,938` | Full nationwide Indian Railways station directory |
| **Unique Station Codes (`CODE`)** | `8,938` | `0` duplicate station codes; 100% primary-key uniqueness |
| **Missing `CODE` / `STATION_NAME` / `RAILWAY_ZONE`** | `0 / 0 / 0` | 100% schema completeness across all 8,938 records |
| **Railway Zones Covered** | `18` zones | `NR` (1,046), `SCR` (770), `ECR` (761), `SR` (733), `WR` (720), `NWR` (584), `ER` (583), `NFR` (550), `NER` (502), `CR` (470), `NCR` (424), `SWR` (393), `SER` (372), `ECOR` (332), `SECR` (311), `WCR` (310), `KR` (72), `BR` (5 cross-border Bangladesh Railway stations) |
| **Station Naming Conventions** | Uppercase strings | Includes suffixes `JN` (Junction), `H` / `HALT` / `PH` (Passenger Halt), `F` (Flag Station), `CANTT` / `CANT`, `TRM` / `TERMINUS` |
| **Duplicate Station Names Across Zones** | `69` shared names | e.g., `BELA` (`BELA` in ECR vs `BELT` in ER), `DADAR` (`DR` in CR vs `DDR` in WR), `BAREILLY` (`BE` in NR vs `BRY` in NER). Disambiguated in UI using `CODE` + `RAILWAY_ZONE` + city/alias metadata. |

### Key Corridor Stations Verified in `Railway_stations.json`
- **Origin / Destination**: `ROU` (ROURKELA, SER), `BSB` (VARANASI JN, NR), `BSBS` (BANARAS / Manduadih, NER), `DDU` (PT DEEN DAYAL UPADHYAY JN, ECR)
- **Primary Interchange Hubs**: `RNC` (RANCHI, SER), `HTE` (HATIA, SER), `TATA` (TATANAGAR JN, SER), `DHN` (DHANBAD JN, ECR), `GAYA` (GAYA JN, ECR), `BKSC` (BOKARO STL CITY, SER), `GMO` (NSC BOSE J GOMO, ECR), `MURI` (MURI, SER), `BRKA` (BARKA KANA, ECR), `JSG` (JHARSUGUDA JN, SER), `BSP` (BILASPUR JN, SECR), `PCOI` (PRAYAGRAJ CHHEOKI, NCR), `PRYJ` (PRAYAGRAJ JN, NCR), `ASN` (ASANSOL JN, ER), `HWH` (HOWRAH JN, ER), `PNBE` (PATNA JN, ECR), `NDLS` (NEW DELHI, NR), `CSMT` (C SHIVAJI TERM MUMBAI, CR), `MAS` (CHENNAI CENTRAL, SR), `SBC` (KSR BANGALORE CY JN, SWR).

---

## 3. System Architecture

1. **Data & Normalization Layer (`src/lib/stationSearch.ts`, `src/data/railwayDataset.ts`)**
   - Preserves original `data/Railway_stations.json` (8,938 stations).
   - Enriches records with city aliases, historical/colonial/renamed aliases (e.g., Mughalsarai → `DDU`, Allahabad → `PRYJ`/`PCOI`, Banaras/Kashi → `BSB`/`BSBS`, Jamshedpur → `TATA`, Bangalore → `SBC`, Bombay → `CSMT`/`MMCT`), Hindi transliterations & Devanagari search tags, and junction/halt classifications.
   - Multi-tier search ranking: Exact Code Match → Code Prefix → Exact Name/Alias Match → Word Prefix → Subsequence/Typo-Tolerant Levenshtein Match, with Junction boost so passenger hubs surface above halts.

2. **Time-Dependent Routing & Connection Engine (`src/lib/routingEngine.ts`)**
   - **Direct Train Discovery**: Date-aware operating day verification in `Asia/Kolkata`, stop sequence & direction validation, midnight-crossing duration calculation, and full stop-by-stop timeline inspection.
   - **Automatic Multi-Route Graph Discovery**: Builds a directed railway timetable graph and discovers valid 2-leg (1 transfer) and 3-leg (2 transfers) routes automatically without manual intermediate searches.
   - **Cycle & Backtracking Prevention**: Enforces strict node-uniqueness and geographic corridor progression.
   - **Distance & Detour Analytics**: Computes baseline rail distance (from direct trains or shortest feasible rail path), candidate total rail distance, extra km, and `Extra distance % = (candidate - baseline) / baseline * 100`. Groups routes into `Low-distance alternatives`, `Recommended alternatives`, and `Longer-distance alternatives`.
   - **Transfer Buffer & Risk Evaluation**: Supports user-controlled target buffers (`150m` Aggressive, `180m` Default Target, `240m` Safer, or Custom). Evaluates scheduled layover, midnight/multi-day calendar rollovers, incoming train historical delay distribution (median & p90), and live delay to classify connections honestly.
   - **Transparent 100-Point Recommendation Engine**: Weights Distance Efficiency (35%), Connection Safety (25%), Historical Reliability (20%), Journey Duration (15%), and Transfer Complexity (5%), with automatic weight renormalization and reduced confidence indicator when historical delay data is unavailable.

3. **Full-Stack Express + React SPA (`server.ts`, `src/App.tsx`)**
   - Express API server serving `/api/stations/audit`, `/api/stations/search`, `/api/trains/direct`, `/api/routes/multi`, `/api/routes/evaluate`, `/api/trains/:number/live`, `/api/trains/compare`, and `/api/providers/status`.
   - Provider-adapter pattern separating `StationDirectoryProvider`, `TimetableProvider`, `LiveStatusProvider`, and `HistoricalReliabilityProvider`.

---

## 4. Feature Implementation & Verification Checklist

- [x] Inspect and validate `Railway_stations.json` (8,938 stations, 18 zones, 0 missing fields).
- [x] Nationwide station autocomplete with code, name, alias, Hindi/local name, zone badge, and typo tolerance.
- [x] Direct train search with date-aware operating day filtering and stop-sequence timeline modal.
- [x] Automatic multi-route discovery (2-leg and 3-leg connections) sorted by lowest rail distance, shortest duration, best recommendation, or safest connection.
- [x] Baseline rail distance comparison, detour percentage calculation, and configurable detour threshold (25% default, expandable).
- [x] User-controlled transfer buffer (150m, 180m default, 240m, custom) and connection-risk classification.
- [x] Historical train-delay analysis (median, 90th percentile, >15m/>30m/>60m rates, sample size, and honest handling of unavailable history).
- [x] Interactive leg-by-leg train selector that dynamically recalculates layover, risk, and recommendation score when the user switches trains on any leg.
- [x] Live Train Status tracker (Where-Is-My-Train style timeline with actual vs scheduled times, delay, platform, and clear DEMO vs LIVE provenance).
- [x] Live Two-Train Comparison screen with automatic connecting station detection, real-time/what-if incoming delay slider, projected arrival, remaining buffer, and risk status.
- [x] Automated unit tests (`src/lib/railpath.test.ts` via `node:test`) and browser verification.
