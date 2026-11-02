import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Search,
  GitBranch,
  Train,
  Activity,
  Database,
  Bookmark,
  BookmarkCheck,
  Clock,
  SlidersHorizontal,
} from 'lucide-react';
import {
  DirectTrainMatch,
  MultiRouteSearchResponse,
  NormalizedStation,
  RouteDistanceCategory,
  RouteLegOption,
  StationAuditReport,
} from './types/railway';
import { StationSelector } from './components/StationSelector';
import { DirectTrainsView } from './components/DirectTrainsView';
import { MultiRoutesView, SortOption } from './components/MultiRoutesView';
import { LiveStatusView } from './components/LiveStatusView';
import { CompareTrainsView } from './components/CompareTrainsView';
import { StationAuditView } from './components/StationAuditModal';
import {
  Button,
  NavigationItem,
  PageContainer,
  SearchPanel,
  SectionHeading,
  StatusIndicator,
} from './components/ui/Primitives';

type ActiveScreen = 'planner' | 'live' | 'compare' | 'directory';
type PlannerStep = 'search' | 'results' | 'train-options';
type JourneyMode = 'direct' | 'multi';

interface SavedJourneyItem {
  id: string;
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  date: string;
  mode: JourneyMode;
}

interface PlannerHistoryState {
  activeScreen: ActiveScreen;
  plannerStep: PlannerStep;
  selectedRouteId: string | null;
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  journeyDate: string;
  journeyMode: JourneyMode;
  sortBy: SortOption;
  categoryFilter: 'ALL' | RouteDistanceCategory;
}

const DEFAULT_FROM = {
  code: 'ROU',
  displayName: 'Rourkela Junction',
};
const DEFAULT_TO = {
  code: 'BSB',
  displayName: 'Varanasi Junction',
};

const SESSION_STORAGE_KEY = 'railpath_planner_session_v1';

export default function App() {
  const [activeScreen, setActiveScreen] = useState<ActiveScreen>('planner');
  const [plannerStep, setPlannerStep] = useState<PlannerStep>('search');
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [journeyMode, setJourneyMode] = useState<JourneyMode>('multi');

  // Search form state
  const [fromCode, setFromCode] = useState(DEFAULT_FROM.code);
  const [fromName, setFromName] = useState(DEFAULT_FROM.displayName);
  const [toCode, setToCode] = useState(DEFAULT_TO.code);
  const [toName, setToName] = useState(DEFAULT_TO.displayName);
  const [journeyDate, setJourneyDate] = useState('2026-10-28');

  // Multi-route parameters & preserved result view state (Phase 4)
  const [targetBufferMinutes, setTargetBufferMinutes] = useState(180);
  const [maxDetourPct, setMaxDetourPct] = useState(25);
  const [includeTighterConnections, setIncludeTighterConnections] =
    useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('distance');
  const [categoryFilter, setCategoryFilter] = useState<
    'ALL' | RouteDistanceCategory
  >('ALL');
  const [customSelections, setCustomSelections] = useState<
    Record<string, RouteLegOption[]>
  >({});

  // Results state
  const [directTrains, setDirectTrains] = useState<DirectTrainMatch[]>([]);
  const [multiRouteData, setMultiRouteData] =
    useState<MultiRouteSearchResponse | null>(null);
  const [auditReport, setAuditReport] = useState<StationAuditReport | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Cross-screen state for Live Status & Compare Two Trains
  const [liveTrainNumber, setLiveTrainNumber] = useState('18008');
  const [compareIncoming, setCompareIncoming] = useState('18008');
  const [compareOutgoing, setCompareOutgoing] = useState('08043');
  const [compareStation, setCompareStation] = useState<string | undefined>(
    'KGP'
  );

  const isRestoringHistoryRef = useRef(false);

  // Recent searches & Saved journeys
  const [recentSearches, setRecentSearches] = useState<SavedJourneyItem[]>([
    {
      id: 'ROP-BPO-2026-10-29',
      fromCode: 'ROP',
      fromName: 'Rupsa Junction',
      toCode: 'BPO',
      toName: 'Baripada',
      date: '2026-10-29',
      mode: 'direct',
    },
    {
      id: 'ROU-BPO-2026-10-29',
      fromCode: 'ROU',
      fromName: 'Rourkela Junction',
      toCode: 'BPO',
      toName: 'Baripada',
      date: '2026-10-29',
      mode: 'multi',
    },
    {
      id: 'ROP-ROU-2026-10-29',
      fromCode: 'ROP',
      fromName: 'Rupsa Junction',
      toCode: 'ROU',
      toName: 'Rourkela Junction',
      date: '2026-10-29',
      mode: 'multi',
    },
    {
      id: 'ROU-BSB-2026-10-28',
      fromCode: 'ROU',
      fromName: 'Rourkela Junction',
      toCode: 'BSB',
      toName: 'Varanasi Junction',
      date: '2026-10-28',
      mode: 'multi',
    },
  ]);

  const [savedJourneys, setSavedJourneys] = useState<SavedJourneyItem[]>(() => {
    try {
      const raw = localStorage.getItem('railpath_saved_journeys');
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(
        'railpath_saved_journeys',
        JSON.stringify(savedJourneys)
      );
    } catch {
      // Ignore storage errors
    }
  }, [savedJourneys]);

  // Persist planner session state in sessionStorage so Back/Forward & refresh preserve selections
  useEffect(() => {
    try {
      sessionStorage.setItem(
        SESSION_STORAGE_KEY,
        JSON.stringify({
          activeScreen,
          plannerStep,
          selectedRouteId,
          fromCode,
          fromName,
          toCode,
          toName,
          journeyDate,
          journeyMode,
          sortBy,
          categoryFilter,
        })
      );
    } catch {
      // Ignore storage errors
    }
  }, [
    activeScreen,
    plannerStep,
    selectedRouteId,
    fromCode,
    fromName,
    toCode,
    toName,
    journeyDate,
    journeyMode,
    sortBy,
    categoryFilter,
  ]);

  // Load station audit on mount
  useEffect(() => {
    fetch('/api/stations/audit')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setAuditReport(data);
      })
      .catch(() => {});
  }, []);

  const buildPlannerUrl = useCallback(
    (
      nextActiveScreen: ActiveScreen,
      nextStep: PlannerStep,
      nextRouteId: string | null,
      origin: string,
      dest: string,
      date: string,
      mode: JourneyMode
    ) => {
      const params = new URLSearchParams();
      if (nextActiveScreen !== 'planner') {
        params.set('tab', nextActiveScreen);
      } else {
        params.set('screen', nextStep);
        params.set('from', origin);
        params.set('to', dest);
        params.set('date', date);
        params.set('mode', mode);
        if (nextStep === 'train-options' && nextRouteId) {
          params.set('routeId', nextRouteId);
        }
      }
      const qs = params.toString();
      return `${window.location.pathname}${qs ? `?${qs}` : ''}`;
    },
    []
  );

  const pushPlannerHistory = useCallback(
    (
      nextActiveScreen: ActiveScreen,
      nextStep: PlannerStep,
      nextRouteId: string | null,
      overrides?: Partial<{
        fromCode: string;
        fromName: string;
        toCode: string;
        toName: string;
        journeyDate: string;
        journeyMode: JourneyMode;
        sortBy: SortOption;
        categoryFilter: 'ALL' | RouteDistanceCategory;
      }>,
      replace = false
    ) => {
      const stateObj: PlannerHistoryState = {
        activeScreen: nextActiveScreen,
        plannerStep: nextStep,
        selectedRouteId: nextRouteId,
        fromCode: overrides?.fromCode ?? fromCode,
        fromName: overrides?.fromName ?? fromName,
        toCode: overrides?.toCode ?? toCode,
        toName: overrides?.toName ?? toName,
        journeyDate: overrides?.journeyDate ?? journeyDate,
        journeyMode: overrides?.journeyMode ?? journeyMode,
        sortBy: overrides?.sortBy ?? sortBy,
        categoryFilter: overrides?.categoryFilter ?? categoryFilter,
      };
      const url = buildPlannerUrl(
        stateObj.activeScreen,
        stateObj.plannerStep,
        stateObj.selectedRouteId,
        stateObj.fromCode,
        stateObj.toCode,
        stateObj.journeyDate,
        stateObj.journeyMode
      );
      if (replace) {
        window.history.replaceState(stateObj, '', url);
      } else {
        window.history.pushState(stateObj, '', url);
      }
    },
    [
      fromCode,
      fromName,
      toCode,
      toName,
      journeyDate,
      journeyMode,
      sortBy,
      categoryFilter,
      buildPlannerUrl,
    ]
  );

  const navigatePlannerScreen = useCallback(
    (
      nextStep: PlannerStep,
      nextRouteId: string | null = null,
      overrides?: Partial<{
        fromCode: string;
        fromName: string;
        toCode: string;
        toName: string;
        journeyDate: string;
        journeyMode: JourneyMode;
        sortBy: SortOption;
        categoryFilter: 'ALL' | RouteDistanceCategory;
      }>
    ) => {
      setActiveScreen('planner');
      setPlannerStep(nextStep);
      setSelectedRouteId(nextRouteId);
      if (!isRestoringHistoryRef.current) {
        pushPlannerHistory('planner', nextStep, nextRouteId, overrides, false);
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
    },
    [pushPlannerHistory]
  );

  // Initialize initial history state & listen for browser Back/Forward buttons (popstate)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlStep = params.get('screen') as PlannerStep | null;
    const urlRouteId = params.get('routeId');
    const urlFrom = params.get('from');
    const urlTo = params.get('to');
    const urlDate = params.get('date');
    const urlMode = params.get('mode') as JourneyMode | null;

    let initStep: PlannerStep = 'search';
    let initRouteId: string | null = null;
    if (
      urlStep === 'search' ||
      urlStep === 'results' ||
      urlStep === 'train-options'
    ) {
      initStep = urlStep;
      if (urlStep === 'train-options' && urlRouteId) {
        initRouteId = urlRouteId;
      }
    }
    if (urlFrom) setFromCode(urlFrom);
    if (urlTo) setToCode(urlTo);
    if (urlDate) setJourneyDate(urlDate);
    if (urlMode === 'direct' || urlMode === 'multi') setJourneyMode(urlMode);
    setPlannerStep(initStep);
    setSelectedRouteId(initRouteId);

    pushPlannerHistory(
      'planner',
      initStep,
      initRouteId,
      {
        fromCode: urlFrom || fromCode,
        toCode: urlTo || toCode,
        journeyDate: urlDate || journeyDate,
        journeyMode: urlMode === 'direct' || urlMode === 'multi' ? urlMode : journeyMode,
      },
      true
    );

    const handlePopState = (event: PopStateEvent) => {
      isRestoringHistoryRef.current = true;
      const st = event.state as PlannerHistoryState | null;
      if (st) {
        setActiveScreen(st.activeScreen || 'planner');
        setPlannerStep(st.plannerStep || 'search');
        setSelectedRouteId(st.selectedRouteId ?? null);
        if (st.fromCode) setFromCode(st.fromCode);
        if (st.fromName) setFromName(st.fromName);
        if (st.toCode) setToCode(st.toCode);
        if (st.toName) setToName(st.toName);
        if (st.journeyDate) setJourneyDate(st.journeyDate);
        if (st.journeyMode) setJourneyMode(st.journeyMode);
        if (st.sortBy) setSortBy(st.sortBy);
        if (st.categoryFilter) setCategoryFilter(st.categoryFilter);
      } else {
        const p = new URLSearchParams(window.location.search);
        const step = (p.get('screen') as PlannerStep) || 'search';
        setActiveScreen('planner');
        setPlannerStep(step);
        setSelectedRouteId(p.get('routeId'));
      }
      window.scrollTo({ top: 0, behavior: 'auto' });
      setTimeout(() => {
        isRestoringHistoryRef.current = false;
      }, 0);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const executeJourneySearch = useCallback(
    async (
      origin: string,
      dest: string,
      date: string,
      buffer: number,
      detour: number,
      tighter: boolean,
      preferMode?: JourneyMode
    ) => {
      if (!origin || !dest || origin === dest) {
        setErrorMsg(
          'Please select two distinct railway stations for Origin and Destination.'
        );
        return false;
      }
      setErrorMsg(null);
      setIsLoading(true);

      try {
        const [directRes, multiRes] = await Promise.all([
          fetch(
            `/api/trains/direct?from=${encodeURIComponent(
              origin
            )}&to=${encodeURIComponent(dest)}&date=${encodeURIComponent(date)}`
          ),
          fetch(
            `/api/routes/multi?from=${encodeURIComponent(
              origin
            )}&to=${encodeURIComponent(
              dest
            )}&date=${encodeURIComponent(date)}&buffer=${buffer}&maxDetour=${detour}&tighter=${tighter}`
          ),
        ]);

        let loadedDirect: DirectTrainMatch[] = [];
        let loadedMulti: MultiRouteSearchResponse | null = null;

        if (directRes.ok) {
          const dJson = await directRes.json();
          loadedDirect = dJson.trains || [];
          setDirectTrains(loadedDirect);
        }
        if (multiRes.ok) {
          const mJson = await multiRes.json();
          loadedMulti = mJson;
          setMultiRouteData(mJson);
          if (mJson.originName) setFromName(mJson.originName);
          if (mJson.destinationName) setToName(mJson.destinationName);
        }

        if (preferMode) {
          setJourneyMode(preferMode);
        } else if (
          loadedDirect.length > 0 &&
          (!loadedMulti || loadedMulti.routes.length === 0)
        ) {
          setJourneyMode('direct');
        } else if (
          loadedDirect.length === 0 &&
          loadedMulti &&
          loadedMulti.routes.length > 0
        ) {
          setJourneyMode('multi');
        }
        return true;
      } catch {
        setErrorMsg('Unable to reach route planning service. Please retry.');
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Keep route data fresh when parameters change
  useEffect(() => {
    void executeJourneySearch(
      fromCode,
      toCode,
      journeyDate,
      targetBufferMinutes,
      maxDetourPct,
      includeTighterConnections
    );
  }, [
    fromCode,
    toCode,
    journeyDate,
    targetBufferMinutes,
    maxDetourPct,
    includeTighterConnections,
    executeJourneySearch,
  ]);

  const handleSwapStations = () => {
    const tempCode = fromCode;
    const tempName = fromName;
    setFromCode(toCode);
    setFromName(toName);
    setToCode(tempCode);
    setToName(tempName);
  };

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromCode || !toCode || fromCode === toCode) {
      setErrorMsg(
        'Please select two distinct railway stations for Origin and Destination.'
      );
      return;
    }

    setCustomSelections({});
    setSelectedRouteId(null);

    const newEntry: SavedJourneyItem = {
      id: `${fromCode}-${toCode}-${journeyDate}`,
      fromCode,
      fromName,
      toCode,
      toName,
      date: journeyDate,
      mode: journeyMode,
    };
    setRecentSearches((prev) => [
      newEntry,
      ...prev.filter((item) => item.id !== newEntry.id).slice(0, 4),
    ]);

    // Navigate to Screen 2 (Route Results) immediately and execute/refresh search
    navigatePlannerScreen('results', null, {
      fromCode,
      fromName,
      toCode,
      toName,
      journeyDate,
      journeyMode,
    });

    await executeJourneySearch(
      fromCode,
      toCode,
      journeyDate,
      targetBufferMinutes,
      maxDetourPct,
      includeTighterConnections
    );
  };

  const handleQuickCorridorSelect = async (item: SavedJourneyItem) => {
    setFromCode(item.fromCode);
    setFromName(item.fromName);
    setToCode(item.toCode);
    setToName(item.toName);
    setJourneyDate(item.date);
    setJourneyMode(item.mode);
    setCustomSelections({});
    setSelectedRouteId(null);

    navigatePlannerScreen('results', null, {
      fromCode: item.fromCode,
      fromName: item.fromName,
      toCode: item.toCode,
      toName: item.toName,
      journeyDate: item.date,
      journeyMode: item.mode,
    });

    await executeJourneySearch(
      item.fromCode,
      item.toCode,
      item.date,
      targetBufferMinutes,
      maxDetourPct,
      includeTighterConnections,
      item.mode
    );
  };

  const currentSaveId = `${fromCode}-${toCode}-${journeyDate}`;
  const isCurrentSaved = savedJourneys.some((j) => j.id === currentSaveId);

  const handleToggleSaveJourney = () => {
    if (isCurrentSaved) {
      setSavedJourneys((prev) => prev.filter((j) => j.id !== currentSaveId));
    } else {
      setSavedJourneys((prev) => [
        {
          id: currentSaveId,
          fromCode,
          fromName,
          toCode,
          toName,
          date: journeyDate,
          mode: journeyMode,
        },
        ...prev,
      ]);
    }
  };

  const handleOpenLiveStatus = (trainNumber: string) => {
    setLiveTrainNumber(trainNumber);
    setActiveScreen('live');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleOpenCompareTrains = (
    inc: string,
    out: string,
    stationCode: string
  ) => {
    setCompareIncoming(inc);
    setCompareOutgoing(out);
    setCompareStation(stationCode);
    setActiveScreen('compare');
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#17243B] pb-20 md:pb-12">
      {/* Phase 2: Professional, Compact Application Header */}
      <header className="bg-[#FFFFFF]/95 backdrop-blur-md border-b border-[#E6EAF0] sticky top-0 z-30">
        <PageContainer className="h-14 sm:h-16 flex items-center justify-between gap-4 sm:gap-8">
          {/* Left: Brand Logo & Wordmark */}
          <a
            href="#top"
            onClick={(e) => {
              e.preventDefault();
              navigatePlannerScreen('search', null);
            }}
            className="inline-flex items-center gap-2.5 text-[#17243B] hover:opacity-90 transition-opacity whitespace-nowrap shrink-0"
          >
            <span
              aria-hidden="true"
              className="w-8 h-8 rounded-lg bg-[#2447A8] text-white flex items-center justify-center shadow-[0_2px_6px_rgba(36,71,168,0.25)]"
            >
              <Train className="w-4 h-4 stroke-[2.2]" />
            </span>
            <span className="text-[16px] sm:text-[17px] font-bold tracking-[-0.02em] text-[#17243B]">
              RailPath <span className="font-medium text-[#64748B]">India</span>
            </span>
          </a>

          {/* Center: Desktop Primary Navigation */}
          <nav
            aria-label="Primary Navigation"
            className="hidden md:flex items-center gap-7 h-full"
          >
            <NavigationItem
              label="Route Planner"
              href="#planner"
              active={activeScreen === 'planner'}
              onClick={() => setActiveScreen('planner')}
            />
            <NavigationItem
              label="Live Train Status"
              href="#live-status"
              active={activeScreen === 'live'}
              onClick={() => setActiveScreen('live')}
            />
            <NavigationItem
              label="Compare Two Trains"
              href="#compare-trains"
              active={activeScreen === 'compare'}
              onClick={() => setActiveScreen('compare')}
            />
            <NavigationItem
              label="Station Directory"
              href="#station-directory"
              active={activeScreen === 'directory'}
              onClick={() => setActiveScreen('directory')}
            />
          </nav>

          {/* Right: Contextual Utility Action (No fixed route-specific text) */}
          <div className="flex items-center gap-2.5 shrink-0">
            {activeScreen === 'planner' && plannerStep !== 'search' ? (
              <Button
                variant="secondary"
                size="sm"
                data-testid="header-contextual-search-btn"
                onClick={() => navigatePlannerScreen('search', null)}
              >
                <Search className="w-3.5 h-3.5 text-[#2447A8]" />
                <span>New Search</span>
              </Button>
            ) : (
              <Button
                variant="subtle"
                size="sm"
                data-testid="header-station-directory-btn"
                onClick={() => setActiveScreen('directory')}
              >
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full bg-[#168A83]"
                />
                <span className="font-mono font-semibold text-[#17243B]">
                  {auditReport
                    ? auditReport.totalRecords.toLocaleString()
                    : '8,938'}
                </span>
                <span className="text-[#64748B]">Stations</span>
              </Button>
            )}
          </div>
        </PageContainer>
      </header>

      {/* Main Content Container */}
      <PageContainer
        as="main"
        className="flex-1 pt-4 sm:pt-8 lg:pt-10 space-y-5 sm:space-y-6"
      >
        {activeScreen === 'planner' && (
          <>
            {/* ==============================================================
                PHASE 3: REDESIGNED SEARCH HOMEPAGE
               ============================================================== */}
            {plannerStep === 'search' && (
              <section
                data-testid="planner-search-screen"
                className="space-y-4 sm:space-y-6 screen-transition"
              >
                {/* Editorial Introductory Header */}
                <SectionHeading
                  eyebrow={
                    <>
                      <span className="sm:hidden">
                        Indian Railways · Route Planner
                      </span>
                      <span className="hidden sm:inline">
                        Indian Railways · Verified Timetable &amp; Connection Intelligence
                      </span>
                    </>
                  }
                  title="Your journey, intelligently planned."
                  subtitle="Discover direct trains and smarter connections across India."
                  headingTestId="mobile-search-heading"
                  subtitleTestId="mobile-search-supporting-text"
                  rightContent={
                    <div className="hidden sm:flex items-center gap-2 text-xs text-[#64748B]">
                      <span>
                        <strong className="font-mono font-semibold text-[#17243B]">
                          {auditReport
                            ? auditReport.totalRecords.toLocaleString()
                            : '8,938'}
                        </strong>{' '}
                        stations across 18 railway zones
                      </span>
                      <span aria-hidden="true">·</span>
                      <button
                        type="button"
                        onClick={() => setActiveScreen('directory')}
                        className="text-[#2447A8] font-semibold hover:underline cursor-pointer"
                      >
                        Explore Directory →
                      </button>
                    </div>
                  }
                />

                {/* Prominent, Premium Search Panel */}
                <SearchPanel
                  onSubmit={handleSearchSubmit}
                  data-testid="journey-search-form"
                >
                  {/* Primary Horizontal Search Controls */}
                  <div className="flex flex-col lg:flex-row items-stretch lg:items-center gap-2 sm:gap-2.5">
                    {/* From Station */}
                    <StationSelector
                      id="from-station-input"
                      label="From Station"
                      selectedCode={fromCode}
                      selectedDisplayName={fromName}
                      onSelect={(st: NormalizedStation) => {
                        setFromCode(st.code);
                        setFromName(st.displayName);
                      }}
                    />

                    {/* Refined Station-Swap Button */}
                    <div className="flex items-center justify-center -my-2.5 lg:my-0 z-10">
                      <button
                        type="button"
                        onClick={handleSwapStations}
                        aria-label="Swap Origin and Destination Stations"
                        title="Swap Origin and Destination Stations"
                        className="group h-9 w-9 sm:h-10 sm:w-10 rounded-full border border-[#E6EAF0] bg-[#FFFFFF] hover:border-[#2447A8] text-[#64748B] hover:text-[#2447A8] shadow-[0_2px_6px_rgba(23,36,59,0.06)] flex items-center justify-center transition-all duration-150 shrink-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2447A8]"
                      >
                        <ArrowLeftRight className="w-4 h-4 transition-transform duration-200 group-hover:rotate-180" />
                      </button>
                    </div>

                    {/* To Station */}
                    <StationSelector
                      id="to-station-input"
                      label="To Station"
                      selectedCode={toCode}
                      selectedDisplayName={toName}
                      onSelect={(st: NormalizedStation) => {
                        setToCode(st.code);
                        setToName(st.displayName);
                      }}
                    />

                    {/* Journey Date Control */}
                    <div className="w-full lg:w-52 shrink-0">
                      <div className="h-[64px] sm:h-[72px] px-3.5 sm:px-4 py-2 bg-[#FFFFFF] hover:bg-[#F8FAFC]/80 border border-[#E6EAF0] hover:border-[#CBD5E1] focus-within:border-[#2447A8] focus-within:ring-2 focus-within:ring-[#2447A8]/15 rounded-xl flex flex-col justify-between transition-all">
                        <div className="flex items-center justify-between gap-2">
                          <label
                            htmlFor="journey-date-input"
                            className="block text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#64748B]"
                          >
                            Journey Date
                          </label>
                          <span className="font-mono text-[10px] font-semibold text-[#168A83]">
                            IST
                          </span>
                        </div>
                        <input
                          id="journey-date-input"
                          type="date"
                          value={journeyDate}
                          onChange={(e) => setJourneyDate(e.target.value)}
                          className="w-full bg-transparent text-[15px] font-mono font-semibold text-[#17243B] focus:outline-none cursor-pointer leading-tight"
                        />
                        <div className="text-[11px] text-[#64748B] truncate leading-tight hidden sm:block">
                          Departure calendar date
                        </div>
                      </div>
                    </div>

                    {/* Large, Tasteful Search Routes Button */}
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      data-testid="search-routes-submit-btn"
                      className="w-full lg:w-auto lg:h-[72px] lg:px-7"
                    >
                      <Search className="w-4 h-4 stroke-[2.2]" />
                      <span>Search Routes</span>
                    </Button>
                  </div>

                  {/* Secondary Preferences & Quick Corridors Bar */}
                  <div className="mt-4 pt-3.5 border-t border-[#E6EAF0] flex flex-col md:flex-row md:items-center justify-between gap-3">
                    {/* Left: Transfer Buffer & Save Corridor */}
                    <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#64748B]">
                      <span className="inline-flex items-center gap-1.5 font-medium text-[#17243B]">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-[#168A83]" />
                        <span>Transfer Buffer</span>
                      </span>
                      <div
                        role="group"
                        aria-label="Minimum Transfer Buffer"
                        className="inline-flex items-center p-0.5 bg-[#F8FAFC] border border-[#E6EAF0] rounded-lg"
                      >
                        {[150, 180, 240].map((min) => (
                          <button
                            key={min}
                            type="button"
                            onClick={() => setTargetBufferMinutes(min)}
                            className={`px-2.5 py-1 rounded-md font-mono text-[11px] font-medium transition-colors cursor-pointer ${
                              targetBufferMinutes === min
                                ? 'bg-[#FFFFFF] text-[#2447A8] font-semibold shadow-2xs'
                                : 'text-[#64748B] hover:text-[#17243B]'
                            }`}
                          >
                            {min}m
                          </button>
                        ))}
                      </div>

                      <span
                        aria-hidden="true"
                        className="hidden sm:inline text-[#E6EAF0]"
                      >
                        |
                      </span>

                      <button
                        type="button"
                        onClick={handleToggleSaveJourney}
                        className="px-2.5 py-1 text-xs font-medium text-[#64748B] hover:text-[#17243B] transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                      >
                        {isCurrentSaved ? (
                          <>
                            <BookmarkCheck className="w-3.5 h-3.5 text-[#15803D]" />
                            <span className="text-[#15803D] font-semibold">
                              Saved ({fromCode} → {toCode})
                            </span>
                          </>
                        ) : (
                          <>
                            <Bookmark className="w-3.5 h-3.5 text-[#64748B]" />
                            <span>Save Route</span>
                          </>
                        )}
                      </button>
                    </div>

                    {/* Right: Recent Searches as Clean Interactive Links */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-[#64748B]">
                      <span className="inline-flex items-center gap-1 text-[#64748B]">
                        <Clock className="w-3.5 h-3.5 text-[#64748B]/80 shrink-0" />
                        <span>Recent:</span>
                      </span>
                      {recentSearches.map((item, idx) => (
                        <React.Fragment key={item.id}>
                          {idx > 0 && (
                            <span
                              aria-hidden="true"
                              className="text-[#CBD5E1]"
                            >
                              ·
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => void handleQuickCorridorSelect(item)}
                            className="font-mono text-[11.5px] font-medium text-[#17243B] hover:text-[#2447A8] transition-colors whitespace-nowrap cursor-pointer"
                          >
                            {item.fromCode} → {item.toCode}{' '}
                            <span className="text-[#64748B]">
                              ({item.date.slice(5)})
                            </span>
                          </button>
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </SearchPanel>

                {auditReport?.missingFileHelp && (
                  <div
                    role="alert"
                    className="bg-amber-50 border border-amber-200 text-amber-900 px-4 py-3 rounded-xl text-xs font-medium"
                  >
                    <strong>Station Dataset Notice:</strong>{' '}
                    {auditReport.missingFileHelp}
                  </div>
                )}

                {errorMsg && (
                  <div
                    role="alert"
                    className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl text-xs font-medium"
                  >
                    {errorMsg}
                  </div>
                )}
              </section>
            )}

            {/* ==============================================================
                PHASE 2: DEDICATED ROUTE RESULTS SCREEN
               ============================================================== */}
            {plannerStep === 'results' && (
              <section
                data-testid="planner-results-screen"
                className="space-y-4 sm:space-y-5 screen-transition"
              >
                {/* Compact, Classical Search Summary & Mode Navigation Bar */}
                <div
                  data-testid="results-search-summary-bar"
                  className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-2xl p-4 sm:p-5 rp-shadow-card flex flex-col lg:flex-row lg:items-center justify-between gap-4"
                >
                  {/* Left: Origin → Destination Corridor & Journey Metadata */}
                  <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 min-w-0">
                    <Button
                      variant="secondary"
                      size="sm"
                      data-testid="back-to-search-btn"
                      onClick={() => navigatePlannerScreen('search', null)}
                      className="self-start sm:self-auto shrink-0"
                    >
                      <ArrowLeft className="w-3.5 h-3.5 text-[#2447A8]" />
                      <span>Edit Search</span>
                    </Button>

                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2 text-base sm:text-lg font-bold text-[#17243B] tracking-tight">
                        <span>{fromName}</span>
                        <span className="font-mono text-xs font-bold text-[#2447A8]">
                          ({fromCode})
                        </span>
                        <span className="text-[#64748B]/60" aria-hidden="true">
                          →
                        </span>
                        <span>{toName}</span>
                        <span className="font-mono text-xs font-bold text-[#2447A8]">
                          ({toCode})
                        </span>
                      </div>
                      <div className="text-xs text-[#64748B] flex flex-wrap items-center gap-2">
                        <span className="font-mono font-medium text-[#17243B]">
                          {journeyDate}
                        </span>
                        <span aria-hidden="true" className="text-[#CBD5E1]">
                          ·
                        </span>
                        <span>
                          {directTrains.length} direct{' '}
                          {directTrains.length === 1 ? 'train' : 'trains'}
                        </span>
                        <span aria-hidden="true" className="text-[#CBD5E1]">
                          ·
                        </span>
                        <span>
                          {multiRouteData?.routes.length || 0} connecting{' '}
                          {(multiRouteData?.routes.length || 0) === 1
                            ? 'route'
                            : 'routes'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Direct vs Multiple Routes Segmented Switcher & Save Button */}
                  <div className="flex flex-wrap items-center gap-2.5 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-[#E6EAF0]">
                    <div
                      role="group"
                      aria-label="Journey Search Mode"
                      className="inline-flex p-1 bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl"
                    >
                      <button
                        type="button"
                        onClick={() => setJourneyMode('direct')}
                        className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                          journeyMode === 'direct'
                            ? 'bg-[#FFFFFF] text-[#2447A8] shadow-xs font-bold'
                            : 'text-[#64748B] hover:text-[#17243B]'
                        }`}
                      >
                        <Train className="w-3.5 h-3.5 stroke-[2.2]" />
                        <span>Direct ({directTrains.length})</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setJourneyMode('multi')}
                        className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                          journeyMode === 'multi'
                            ? 'bg-[#FFFFFF] text-[#2447A8] shadow-xs font-bold'
                            : 'text-[#64748B] hover:text-[#17243B]'
                        }`}
                      >
                        <GitBranch className="w-3.5 h-3.5 stroke-[2.2]" />
                        <span>
                          Multiple Routes ({multiRouteData?.routes.length || 0})
                        </span>
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={handleToggleSaveJourney}
                      className="h-[38px] px-3 text-xs font-medium text-[#64748B] hover:text-[#17243B] bg-[#FFFFFF] hover:bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                    >
                      {isCurrentSaved ? (
                        <>
                          <BookmarkCheck className="w-3.5 h-3.5 text-[#15803D]" />
                          <span className="text-[#15803D] font-semibold">
                            Saved
                          </span>
                        </>
                      ) : (
                        <>
                          <Bookmark className="w-3.5 h-3.5 text-[#64748B]" />
                          <span>Save</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {errorMsg && (
                  <div
                    role="alert"
                    className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-xl text-xs font-medium"
                  >
                    {errorMsg}
                  </div>
                )}

                {isLoading ? (
                  <div className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-2xl p-8 space-y-4 animate-pulse rp-shadow-card">
                    <div className="h-5 bg-slate-200 rounded w-1/3" />
                    <div className="h-28 bg-slate-100 rounded-xl" />
                    <div className="h-28 bg-slate-100 rounded-xl" />
                  </div>
                ) : journeyMode === 'direct' ? (
                  <DirectTrainsView
                    fromCode={fromCode}
                    fromName={fromName}
                    toCode={toCode}
                    toName={toName}
                    journeyDate={journeyDate}
                    trains={directTrains}
                    multiRoutesCount={multiRouteData?.routes.length || 0}
                    diagnostics={multiRouteData?.diagnostics}
                    onSwitchToMultiRoutes={() => setJourneyMode('multi')}
                    onOpenLiveStatus={handleOpenLiveStatus}
                    onChangeDate={(newDate) => setJourneyDate(newDate)}
                  />
                ) : (
                  multiRouteData && (
                    <MultiRoutesView
                      searchData={multiRouteData}
                      directTrains={directTrains}
                      targetBufferMinutes={targetBufferMinutes}
                      maxDetourPct={maxDetourPct}
                      includeTighterConnections={includeTighterConnections}
                      onUpdateBuffer={(min) => setTargetBufferMinutes(min)}
                      onUpdateMaxDetour={(pct) => setMaxDetourPct(pct)}
                      onToggleTighter={(inc) =>
                        setIncludeTighterConnections(inc)
                      }
                      onSwitchToDirect={() => setJourneyMode('direct')}
                      onOpenLiveStatus={handleOpenLiveStatus}
                      onOpenCompareTrains={handleOpenCompareTrains}
                      selectedRouteId={null}
                      onSelectRouteForTrainOptions={(routeId) =>
                        navigatePlannerScreen('train-options', routeId)
                      }
                      onEditSearch={() => navigatePlannerScreen('search', null)}
                      sortBy={sortBy}
                      onChangeSortBy={setSortBy}
                      categoryFilter={categoryFilter}
                      onChangeCategoryFilter={setCategoryFilter}
                      customSelections={customSelections}
                      onChangeCustomSelections={setCustomSelections}
                    />
                  )
                )}
              </section>
            )}

            {/* ==============================================================
                PHASE 4 SCREEN 3: DEDICATED TRAIN OPTIONS SCREEN FOR SELECTED ROUTE
               ============================================================== */}
            {plannerStep === 'train-options' && (
              <section
                data-testid="planner-train-options-screen"
                className="space-y-4 screen-transition"
              >
                {isLoading || !multiRouteData ? (
                  <div className="bg-white border border-slate-200 rounded-xl p-8 space-y-4 animate-pulse">
                    <div className="h-5 bg-slate-200 rounded w-1/3" />
                    <div className="h-24 bg-slate-100 rounded-xl" />
                    <div className="h-24 bg-slate-100 rounded-xl" />
                  </div>
                ) : (
                  <MultiRoutesView
                    searchData={multiRouteData}
                    directTrains={directTrains}
                    targetBufferMinutes={targetBufferMinutes}
                    maxDetourPct={maxDetourPct}
                    includeTighterConnections={includeTighterConnections}
                    onUpdateBuffer={(min) => setTargetBufferMinutes(min)}
                    onUpdateMaxDetour={(pct) => setMaxDetourPct(pct)}
                    onToggleTighter={(inc) =>
                      setIncludeTighterConnections(inc)
                    }
                    onSwitchToDirect={() => {
                      setJourneyMode('direct');
                      navigatePlannerScreen('results', null);
                    }}
                    onOpenLiveStatus={handleOpenLiveStatus}
                    onOpenCompareTrains={handleOpenCompareTrains}
                    selectedRouteId={selectedRouteId}
                    onSelectRouteForTrainOptions={(routeId) =>
                      navigatePlannerScreen('train-options', routeId)
                    }
                    onBackToResults={() =>
                      navigatePlannerScreen('results', null)
                    }
                    onEditSearch={() => navigatePlannerScreen('search', null)}
                    sortBy={sortBy}
                    onChangeSortBy={setSortBy}
                    categoryFilter={categoryFilter}
                    onChangeCategoryFilter={setCategoryFilter}
                    customSelections={customSelections}
                    onChangeCustomSelections={setCustomSelections}
                  />
                )}
              </section>
            )}
          </>
        )}

        {/* Live Train Status Screen */}
        {activeScreen === 'live' && (
          <div className="screen-transition">
            <LiveStatusView
              initialTrainNumber={liveTrainNumber}
              journeyDate={journeyDate}
              onSelectTrainForComparison={(trainNumber) => {
                setCompareIncoming(trainNumber);
                setActiveScreen('compare');
              }}
            />
          </div>
        )}

        {/* Compare Two Trains Live Screen */}
        {activeScreen === 'compare' && (
          <div className="screen-transition">
            <CompareTrainsView
              initialIncomingTrain={compareIncoming}
              initialOutgoingTrain={compareOutgoing}
              initialConnectingStation={compareStation}
              journeyDate={journeyDate}
              targetBufferMinutes={targetBufferMinutes}
            />
          </div>
        )}

        {/* Nationwide Station Directory & Data Audit Screen */}
        {activeScreen === 'directory' && (
          <div className="screen-transition">
            <StationAuditView
              auditReport={auditReport}
              onSelectStationAsOrigin={(st) => {
                setFromCode(st.code);
                setFromName(st.displayName);
                navigatePlannerScreen('search', null, {
                  fromCode: st.code,
                  fromName: st.displayName,
                });
              }}
              onSelectStationAsDestination={(st) => {
                setToCode(st.code);
                setToName(st.displayName);
                navigatePlannerScreen('search', null, {
                  toCode: st.code,
                  toName: st.displayName,
                });
              }}
            />
          </div>
        )}
      </PageContainer>

      {/* Clean Editorial Footer */}
      <PageContainer
        as="footer"
        className="mt-12 pt-5 border-t border-[#E6EAF0] text-xs text-[#64748B] flex flex-col sm:flex-row items-center justify-between gap-3"
      >
        <div className="flex items-center gap-2">
          <StatusIndicator tone="teal">Verified Timetable Engine</StatusIndicator>
          <span aria-hidden="true">·</span>
          <span>RailPath India — Nationwide Route &amp; Connection Planner</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={() => setActiveScreen('directory')}
            className="hover:text-[#17243B] transition-colors cursor-pointer"
          >
            8,938 Stations (18 Zones)
          </button>
          <span aria-hidden="true">·</span>
          <button
            type="button"
            onClick={() => setActiveScreen('compare')}
            className="hover:text-[#17243B] transition-colors cursor-pointer"
          >
            Two-Train Live Comparison
          </button>
        </div>
      </PageContainer>

      {/* Mobile Fixed Bottom Navigation Bar */}
      <nav
        aria-label="Mobile Bottom Navigation"
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#FFFFFF]/95 backdrop-blur-md border-t border-[#E6EAF0] grid grid-cols-4 items-center h-14"
      >
        <NavigationItem
          mobile
          label="Routes"
          active={activeScreen === 'planner'}
          onClick={() => setActiveScreen('planner')}
          icon={<GitBranch className="w-4 h-4" />}
        />
        <NavigationItem
          mobile
          label="Live Status"
          active={activeScreen === 'live'}
          onClick={() => setActiveScreen('live')}
          icon={<Train className="w-4 h-4" />}
        />
        <NavigationItem
          mobile
          label="Compare 2"
          active={activeScreen === 'compare'}
          onClick={() => setActiveScreen('compare')}
          icon={<Activity className="w-4 h-4" />}
        />
        <NavigationItem
          mobile
          label="Stations"
          active={activeScreen === 'directory'}
          onClick={() => setActiveScreen('directory')}
          icon={<Database className="w-4 h-4" />}
        />
      </nav>
    </div>
  );
}
