# RailPath India — UI/UX Architecture & Classical Design Specification (`DESIGN.md`)

**Document Version:** 1.0  
**Last Updated:** 2026-11-01  
**Status:** Design Specification for Future Phase 6 & Phase 7 Implementation (No UI changes applied in this documentation step).

---

## 1. Current UI Implementation Audit

### 1.1 Existing Visual Foundation
- **Color Palette**:
  - Canvas background: `#F8FAFC` (`bg-slate-50`)
  - Card surfaces: `#FFFFFF` (`bg-white`) with `border-slate-200`
  - Primary brand & interactive accent: Deep Railway Blue (`text-blue-950`, `bg-blue-900`, `hover:bg-blue-800`, `border-blue-900`)
  - Semantic status colors: Emerald (`emerald-50`/`emerald-800`) for verified distances, Amber (`amber-50`/`amber-900`) for caution/tighter buffers or dataset warnings, Red (`red-50`/`red-800`) for missed connections or validation errors.
- **Typography (`index.html` & `src/index.css`)**:
  - Sans-serif UI & headings: `"Plus Jakarta Sans"`, `-apple-system`, ` BlinkMacSystemFont`, `"Segoe UI"`, `sans-serif`.
  - Monospace tabular data: `"JetBrains Mono"` with `font-variant-numeric: tabular-nums` applied to all station codes (`ROU`, `BSB`), train numbers (`18311`), timestamps (`16:10`), durations (`16h 45m`), distances (`709 km`), and scores (`97/100`).
- **Layout & Navigation**:
  - **Desktop Header**: 3-zone sticky top bar (`h-14` / `py-3 px-8`) containing Brand Wordmark (`RailPath India`), 4 single-line text links (`Route Planner`, `Live Train Status`, `Compare Two Trains`, `Station Directory`), and 1 contextual action button (`ROU → BSB · New Search` when viewing results, or `8,938 Stations` on the search screen).
  - **Mobile Navigation**: Sticky bottom navigation bar (`md:hidden fixed bottom-0`) with 4 icon+label tabs.
  - **Three-Screen Planner Hierarchy**:
    1. `Search Screen` (`plannerStep === 'search'`)
    2. `Route Results Screen` (`plannerStep === 'results'`)
    3. `Train Options Screen` (`plannerStep === 'train-options'`)

### 1.2 Areas Identified for Future Phase 6 Visual Refinement
While the 3-screen planner hierarchy in `src/App.tsx` and `src/components/MultiRoutesView.tsx` is clean and functional, secondary views (`DirectTrainsView.tsx`, `LiveStatusView.tsx`, `CompareTrainsView.tsx`, and `StationAuditModal.tsx`) and expanded detail panels still contain dense multi-badge clusters, nested bordered boxes, and diagnostic callouts that can be simplified into a calmer, classical railway timetable aesthetic.

---

## 2. Target Visual Style & Design Principles (Phase 6 Specification)

The target aesthetic for RailPath India is **Classical, Professional, and Minimal**—inspired by authoritative national railway timetables (such as classic Bradshaw / Indian Railways Zone Timetables and Swiss SBB clarity):

1. **Classical & Authoritative**
   - Rely on crisp typographic alignment, horizontal rules, and structured tabular columns rather than decorative gradients, heavy drop shadows, or marketing banners.
2. **Professional & Trustworthy**
   - Every number, timestamp, station code, and distance label must read like an official railway schedule instrument. Avoid playful icons or promotional badges.
3. **Minimal & Uncluttered**
   - Strip unnecessary nested borders, redundant status pills, and repetitive explanatory text. Let whitespace and alignment separate functional groups.

---

## 3. Color System Specification

| Role | Token / Hex | Tailwind Equivalent | Usage |
| :--- | :--- | :--- | :--- |
| **Primary Canvas** | `#FAFBFD` / `#F8FAFC` | `bg-slate-50` | Main page background |
| **Elevated Surface** | `#FFFFFF` | `bg-white` | Search panel, route summary cards, train option cards |
| **Subtle Recessed Surface** | `#F1F5F9` | `bg-slate-100` | Segmented controls, subtle table headers, inactive tabs |
| **Primary Ink (Headings & Data)** | `#0F172A` | `text-slate-900` | Station names, departure/arrival times, primary headings |
| **Secondary Ink (Labels)** | `#475569` | `text-slate-600` | Supporting descriptions, leg labels, transfer notes |
| **Muted Ink (Metadata)** | `#64748B` | `text-slate-500` | Captions, disclaimers, secondary timestamps |
| **Primary Accent (Railway Blue)** | `#1E3A8A` / `#172554` | `bg-blue-900` / `text-blue-950` | Primary CTAs (`Search Routes`, `View Train Options`), active tabs, station code accents |
| **Structural Hairline** | `#E2E8F0` | `border-slate-200` | Single-level card borders and section dividers (avoid double-nested borders) |
| **Semantic Verified / Safe** | `#065F46` on `#ECFDF5` | `text-emerald-800 bg-emerald-50` | Verified railway distance indicator, comfortable connection status |
| **Semantic Caution / Attention** | `#92400E` on `#FFFBEB` | `text-amber-800 bg-amber-50` | Tighter transfer buffer notice, missing intermediate stop distance notice |
| **Semantic High Risk / Error** | `#991B1B` on `#FEF2F2` | `text-red-800 bg-red-50` | Missed connection warning, invalid form input |

---

## 4. Typography & Hierarchy Rules

1. **Font Pairing**:
   - **UI & Editorial**: `Plus Jakarta Sans` (`400`, `500`, `600`, `700`).
   - **Railway Data & Codes**: `JetBrains Mono` (`500`, `600`, `700`) with `font-variant-numeric: tabular-nums`.
2. **Type Scale**:
   - **Page Title**: `26px–30px` (`text-2xl sm:text-3xl`), `font-bold`, `tracking-tight`, `leading-tight`.
   - **Section / Route Title**: `16px–18px` (`text-base sm:text-lg`), `font-bold`, `text-slate-900`.
   - **Primary Timetable Figures (Times, Distances, Train Numbers)**: `14px–15px` (`text-sm`), `font-mono font-semibold`, `tabular-nums`.
   - **Body / Station Metadata**: `13px–14px` (`text-xs sm:text-sm`), `text-slate-600`.
   - **Micro Labels & Captions**: `11px–12px` (`text-[11px] sm:text-xs`), `font-medium`, `text-slate-500`.

---

## 5. Component & Screen Layout Specifications

### 5.1 Screen 1 — Search Screen
- **Single-Card Focus**: The origin input, swap button, destination input, journey date input, and `Search Routes` button reside in one clean white container (`rounded-xl border border-slate-200 p-4 sm:p-6`).
- **Secondary Controls**: Transfer buffer presets (`150m`, `180m`, `240m`) and recent searches sit in a quiet footer row separated by a single `border-t border-slate-100`.
- **Zero Clutter Above the Fold**: On mobile (`375px`), the entire search form and primary CTA must be immediately visible without scrolling.

### 5.2 Screen 2 — Route Results Screen
- **Compact Search Summary Bar**: Shows `← Back to Search`, `Origin (CODE) → Destination (CODE)`, date, and the `Direct Trains` / `Multiple Routes` segmented toggle.
- **Direct Train Priority Banner**: When verified direct trains exist, display a concise summary bar at the top with direct train number, departure/arrival times, duration, and verified distance (`745 km verified`).
- **Route Option Summary Cards**:
  - Maximum **4 data points per card row**:
    1. Option number + primary distinction label (`Option 1 · Lowest Distance`)
    2. Complete station sequence (`Rourkela Junction (ROU) → Muri (MURI) → Varanasi Junction (BSB)`)
    3. Key metrics strip in `tabular-nums`: **Verified Rail Distance (`709 km`)** · **Total Duration (`20h 13m`)** · **Transfer Wait (`5h 30m at MURI`)** · **Feasibility Status**
    4. Right-aligned Recommendation Score (`97/100`) and single primary action button (`View Train Options →`).
  - Expandable `Journey Details & Distance Info` remains collapsed by default to keep cards scannable.

### 5.3 Screen 3 — Train Options Screen
- **Header Context**: Clear `← Back to Route Results` button alongside the active route path and total verified distance.
- **Active Combination Summary**: Clean horizontal timeline showing `Leg 1 Train` → `Transfer Wait at Interchange` → `Leg 2 Train` with per-leg verified distances (`236 km verified`, `473 km verified`).
- **Per-Leg Train Cards**:
  - Grouped cleanly by leg (`Leg 1 of 2: Rourkela Junction → Muri`, `Leg 2 of 2: Muri → Varanasi Junction`).
  - Each candidate train row displays: Train Number + Name, Departure → Arrival (`HH:MM` + calendar date), Duration, Verified Stop Distance (`km`), and a single radio/select state (`Selected` vs `Select Train`).

---

## 6. Mobile-First Responsiveness & Accessibility Contract

1. **Touch Targets**: Every interactive button, station option, date input, and train selection card must maintain a minimum hit area of `44px × 44px` (`min-h-[48px]` on primary inputs and CTAs).
2. **No Horizontal Overflow**: All layouts must adapt cleanly from `320px` / `375px` mobile viewports up to `1440px` desktop monitors (`overflow-x: hidden`).
3. **Motion Sensitivity**: Screen transitions use a subtle `200ms` fade-and-slide (`railpathScreenEnter` in `src/index.css`) and automatically disable animation when `@media (prefers-reduced-motion: reduce)` is active.
4. **Keyboard & Screen Reader Support**:
   - `StationSelector` supports `ArrowDown`, `ArrowUp`, `Enter`, and `Escape` keys with proper `aria-expanded` and `role="listbox"` semantics.
   - Error alerts and dataset notices use `role="alert"`.
