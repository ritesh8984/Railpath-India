# RailPath India — Railway Data Sources, Provider Architecture & Licensing

## 1. Nationwide Station Directory (`data/Railway_stations.json`)
- **Source File**: User-provided nationwide Indian Railways station dataset (`Railway_stations.json`, 782 KB).
- **Coverage**: `8,938` active station records spanning `18` railway zones (`NR`, `SCR`, `ECR`, `SR`, `WR`, `NWR`, `ER`, `NFR`, `NER`, `CR`, `NCR`, `SWR`, `SER`, `ECOR`, `SECR`, `WCR`, `KR`, and cross-border `BR`).
- **Validation Status**: Verified on startup and via `/api/stations/audit`. Zero missing fields, zero duplicate station codes.
- **Disambiguation**: 69 station names appear in multiple zones or as separate physical stations in the same city (e.g., `DR` Dadar CR vs `DDR` Dadar WR; `BSB` Varanasi Jn NR vs `BSBS` Banaras NER vs `BCY` Varanasi City NER vs `DDU` Pt. Deen Dayal Upadhyaya Jn ECR). RailPath India never treats distinct station codes as the same physical interchange without an explicit interstation transfer warning.

---

## 2. Official & Authorized Indian Railway Data Providers

Indian Railways does not offer an unrestricted, unauthenticated public REST API for commercial/third-party real-time train running status. RailPath India implements a **Provider-Adapter Architecture** that supports official/authorized feeds when credentials are configured in `.env` and falls back to an **explicitly labelled, timetable-grounded Demo & Verification Dataset** when external API keys are absent.

### A. Official Reference Portals
1. **CRIS / NTES (National Train Enquiry System)**
   - URL: `https://enquiry.indianrail.gov.in` / `https://cris.org.in/loadpage?page=proNTES`
   - Scope: Official source for live train running status, coach position, platform updates, diversions, and cancellations.
   - Access Model: Direct B2B API access requires institutional authorization from CRIS (Centre for Railway Information Systems).
2. **Indian Railways Passenger Reservation Enquiry**
   - URL: `https://www.indianrail.gov.in/enquiry/SCHEDULE/TrainSchedule.html?locale=enindian`
   - Scope: Official reserved train schedules, operating days, and route distances.
3. **Open Government Data (OGD) Platform India**
   - URL: `https://www.data.gov.in/catalog/indian-railways-train-time-table`
   - Scope: Published Indian Railways timetable datasets for research and route-planning analysis.

### B. Supported Third-Party API Adapters (`server.ts`)
When `RAILWAY_LIVE_PROVIDER` is configured in `.env` with valid credentials:
- **`rapidapi_irctc`**: Connects server-side to authorized RapidAPI Indian Railway / IRCTC live train status and timetable endpoints using `RAPIDAPI_IRCTC_KEY` and `RAPIDAPI_IRCTC_HOST`.
- **`ntes_partner`**: Connects server-side to an authorized CRIS/NTES partner gateway using `NTES_PARTNER_API_KEY` and `NTES_PARTNER_BASE_URL`.
- **`demo` (Default Local Mode)**: Uses the built-in verified timetable and clearly labelled `DEMO` live/historical observation dataset so all routing algorithms, transfer-buffer evaluations, and two-train comparisons work out of the box without scraping or bypassing CAPTCHAs.

---

## 3. Honest Data Provenance & Freshness Policy
RailPath India enforces strict transparency across every screen:
1. **Station Directory (`VERIFIED_DATASET`)**: Backed by the 8,938-station `Railway_stations.json` file.
2. **Timetable & Multi-Route Graph (`VERIFIED_TIMETABLE_CORRIDOR`)**: Uses real Indian Railways train numbers, stop orders, operating days, and cumulative rail distances (km) across major corridors (including the complete Rourkela `ROU` ↔ Varanasi `BSB` network via `RNC`, `HTE`, `TATA`, `DHN`, `BKSC`, `GMO`, `GAYA`, `DDU`, `MURI`, `BRKA`, `JSG`, `BSP`, `PCOI`, `PRYJ`, `ASN`, `HWH`, `PNBE`, `NDLS`, `BBS`, `VSKP`, `CSMT`, `MAS`, `SBC`, `NGP`).
3. **Historical Delay Observations (`HISTORICAL_OBSERVATIONS_30D` / `UNAVAILABLE`)**: Reports 30-trip median delay, 90th-percentile delay, and >15m/>30m/>60m delay rates. When a train lacks sufficient historical observations (e.g., `18103` Jallianwala Bagh Express or `08624` Ranchi–Islampur Special), the app explicitly displays **"Historical delay data unavailable"**, reduces the data-confidence badge, and renormalizes the recommendation weights rather than assuming 0 minutes delay.
4. **Live Running Status (`DEMO_SIMULATION` vs `LIVE_API`)**: Without external API credentials, live train tracking and two-train comparisons are clearly badged as **`DEMO MODE — SIMULATED RUNNING STATUS`** with interactive what-if delay controls so passengers and engineers can test connection-risk recalculation under realistic delay scenarios.
