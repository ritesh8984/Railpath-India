import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  HelpCircle,
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Activity,
  GitCommit,
  RefreshCw,
  Info,
  Award,
  Search,
  Clock,
} from 'lucide-react';
import {
  DirectTrainMatch,
  MultiRouteCandidate,
  MultiRouteSearchResponse,
  RouteDistanceCategory,
  RouteLegOption,
} from '../types/railway';
import {
  evaluateCustomLegSelection,
  formatDuration,
  MISSING_TOTAL_DISTANCE_MESSAGE,
} from '../lib/routingEngine';

export type SortOption = 'distance' | 'duration' | 'recommendation' | 'safety';

interface MultiRoutesViewProps {
  searchData: MultiRouteSearchResponse;
  directTrains?: DirectTrainMatch[];
  targetBufferMinutes: number;
  maxDetourPct: number;
  includeTighterConnections: boolean;
  onUpdateBuffer: (minutes: number) => void;
  onUpdateMaxDetour: (pct: number) => void;
  onToggleTighter: (include: boolean) => void;
  onSwitchToDirect?: () => void;
  onOpenLiveStatus: (trainNumber: string) => void;
  onOpenCompareTrains: (
    incomingTrainNumber: string,
    outgoingTrainNumber: string,
    connectingStationCode: string
  ) => void;
  // Phase 4: Multi-screen navigation & state preservation props
  selectedRouteId?: string | null;
  onSelectRouteForTrainOptions?: (routeId: string) => void;
  onBackToResults?: () => void;
  onEditSearch?: () => void;
  sortBy?: SortOption;
  onChangeSortBy?: (sort: SortOption) => void;
  categoryFilter?: 'ALL' | RouteDistanceCategory;
  onChangeCategoryFilter?: (cat: 'ALL' | RouteDistanceCategory) => void;
  customSelections?: Record<string, RouteLegOption[]>;
  onChangeCustomSelections?: React.Dispatch<
    React.SetStateAction<Record<string, RouteLegOption[]>>
  >;
}

export const MultiRoutesView: React.FC<MultiRoutesViewProps> = ({
  searchData,
  directTrains,
  targetBufferMinutes,
  maxDetourPct,
  includeTighterConnections,
  onUpdateBuffer,
  onUpdateMaxDetour,
  onToggleTighter,
  onSwitchToDirect,
  onOpenLiveStatus,
  onOpenCompareTrains,
  selectedRouteId = null,
  onSelectRouteForTrainOptions,
  onBackToResults,
  onEditSearch,
  sortBy: controlledSortBy,
  onChangeSortBy,
  categoryFilter: controlledCategoryFilter,
  onChangeCategoryFilter,
  customSelections: controlledCustomSelections,
  onChangeCustomSelections,
}) => {
  const verifiedDirectTrains = directTrains || searchData.directTrains || [];
  const [internalSortBy, setInternalSortBy] = useState<SortOption>('distance');
  const [internalCategoryFilter, setInternalCategoryFilter] = useState<
    'ALL' | RouteDistanceCategory
  >('ALL');
  const [internalSelectedRouteId, setInternalSelectedRouteId] = useState<
    string | null
  >(null);
  const [internalCustomSelections, setInternalCustomSelections] = useState<
    Record<string, RouteLegOption[]>
  >({});
  const [isFiltersOpen, setIsFiltersOpen] = useState(false);
  const [expandedDetailsByRoute, setExpandedDetailsByRoute] = useState<
    Record<string, boolean>
  >({});
  const [customBufferInput, setCustomBufferInput] = useState<string>(
    String(targetBufferMinutes)
  );

  const sortBy = controlledSortBy ?? internalSortBy;
  const setSortBy = onChangeSortBy ?? setInternalSortBy;
  const categoryFilter = controlledCategoryFilter ?? internalCategoryFilter;
  const setCategoryFilter = onChangeCategoryFilter ?? setInternalCategoryFilter;
  const customSelections =
    controlledCustomSelections ?? internalCustomSelections;
  const setCustomSelections =
    onChangeCustomSelections ?? setInternalCustomSelections;
  const activeRouteId =
    onSelectRouteForTrainOptions !== undefined
      ? selectedRouteId
      : internalSelectedRouteId;

  const hasActiveCustomFilters =
    targetBufferMinutes !== 180 ||
    maxDetourPct !== 25 ||
    categoryFilter !== 'ALL' ||
    includeTighterConnections;

  useEffect(() => {
    setCustomBufferInput(String(targetBufferMinutes));
  }, [targetBufferMinutes]);

  useEffect(() => {
    if (onSelectRouteForTrainOptions === undefined) {
      setInternalSelectedRouteId(null);
    }
    if (onChangeCustomSelections === undefined) {
      setInternalCustomSelections({});
    }
    setExpandedDetailsByRoute({});
  }, [
    searchData.originCode,
    searchData.destinationCode,
    searchData.journeyDate,
    searchData.computedAtIso,
    onSelectRouteForTrainOptions,
    onChangeCustomSelections,
  ]);

  // Filter and sort route options stably by the selected sort mode, then apply any custom leg selections in-place
  // so selecting a different train inside a route option never causes the route card to jump positions.
  const filteredAndSortedRoutes = useMemo(() => {
    const list = searchData.routes.filter((r) =>
      categoryFilter === 'ALL' ? true : r.distanceCategory === categoryFilter
    );

    const riskSafetyRank: Record<string, number> = {
      SAFE: 4,
      UNKNOWN: 3,
      CAUTION: 2,
      HIGH_RISK: 1,
      MISSED: 0,
    };

    list.sort((a, b) => {
      if (sortBy === 'distance') {
        const aHasDist = a.distanceReliable !== false && a.totalDistanceKm > 0;
        const bHasDist = b.distanceReliable !== false && b.totalDistanceKm > 0;
        if (aHasDist !== bHasDist) return aHasDist ? -1 : 1;
        if (aHasDist && bHasDist && a.totalDistanceKm !== b.totalDistanceKm) {
          return a.totalDistanceKm - b.totalDistanceKm;
        }
        if (a.numberOfTransfers !== b.numberOfTransfers) {
          return a.numberOfTransfers - b.numberOfTransfers;
        }
        if (b.recommendation.totalScore !== a.recommendation.totalScore) {
          return b.recommendation.totalScore - a.recommendation.totalScore;
        }
        return a.totalDurationMinutes - b.totalDurationMinutes;
      }
      if (sortBy === 'duration') {
        return a.totalDurationMinutes - b.totalDurationMinutes;
      }
      if (sortBy === 'recommendation') {
        return b.recommendation.totalScore - a.recommendation.totalScore;
      }
      if (sortBy === 'safety') {
        const rankDiff =
          riskSafetyRank[b.overallRiskLevel] - riskSafetyRank[a.overallRiskLevel];
        if (rankDiff !== 0) return rankDiff;
        const minLayA = Math.min(
          ...a.transfers.map((t) => t.effectiveLayoverWithP90Minutes)
        );
        const minLayB = Math.min(
          ...b.transfers.map((t) => t.effectiveLayoverWithP90Minutes)
        );
        return minLayB - minLayA;
      }
      return 0;
    });

    return list.map((route) => {
      const customLegs = customSelections[route.routeId];
      if (!customLegs) return route;
      return evaluateCustomLegSelection({
        route,
        selectedLegs: customLegs,
        targetBufferMinutes,
      });
    });
  }, [
    searchData.routes,
    categoryFilter,
    sortBy,
    customSelections,
    targetBufferMinutes,
  ]);

  // Also ensure that if a user is on Screen 3 for a route, we can resolve that route even if a filter was active
  const allEvaluatedRoutes = useMemo(() => {
    return searchData.routes.map((route) => {
      const customLegs = customSelections[route.routeId];
      if (!customLegs) return route;
      return evaluateCustomLegSelection({
        route,
        selectedLegs: customLegs,
        targetBufferMinutes,
      });
    });
  }, [searchData.routes, customSelections, targetBufferMinutes]);

  const handleLegTrainSelect = (
    route: MultiRouteCandidate,
    legIdx: number,
    newOption: RouteLegOption
  ) => {
    const currentLegs = customSelections[route.routeId] || route.selectedLegs;
    const updated = [...currentLegs];
    updated[legIdx] = newOption;
    setCustomSelections((prev) => ({
      ...prev,
      [route.routeId]: updated,
    }));
  };

  const toggleRouteDetails = (routeId: string) => {
    setExpandedDetailsByRoute((prev) => ({
      ...prev,
      [routeId]: !prev[routeId],
    }));
  };

  const renderRiskIndicator = (
    riskLevel: MultiRouteCandidate['overallRiskLevel'],
    riskStatus: string
  ) => {
    if (riskLevel === 'SAFE') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
          <span>{riskStatus}</span>
        </span>
      );
    }
    if (riskLevel === 'CAUTION') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D97706]">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>{riskStatus}</span>
        </span>
      );
    }
    if (riskLevel === 'HIGH_RISK' || riskLevel === 'MISSED') {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#DC2626]">
          <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
          <span>{riskStatus}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#64748B]">
        <HelpCircle className="w-3.5 h-3.5 shrink-0" />
        <span>{riskStatus}</span>
      </span>
    );
  };

  const renderRecommendationScoreBox = (
    route: MultiRouteCandidate,
    idx: number,
    compact = false
  ) => {
    const rec = route.recommendation;
    const scoreAvailable = rec.scoreAvailable !== false;

    return (
      <div
        data-testid={`recommendation-score-box-${idx + 1}`}
        className={`rounded-xl border border-[#E6EAF0] bg-[#F8FAFC] ${
          compact ? 'px-3.5 py-2.5' : 'px-4 py-3'
        } flex flex-col justify-between gap-1`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1">
            <Award className="w-3.5 h-3.5 text-[#168A83] shrink-0" />
            <span>Recommendation</span>
          </span>
          {route.recommendationBadge && (
            <span
              data-testid={`recommendation-badge-${idx + 1}`}
              className="px-2 py-0.5 text-[10.5px] font-bold rounded-md bg-[#2447A8] text-white whitespace-nowrap"
            >
              {route.recommendationBadge}
            </span>
          )}
        </div>

        {scoreAvailable ? (
          <div className="flex items-baseline justify-between gap-2 pt-0.5">
            <span
              data-testid={`recommendation-score-value-${idx + 1}`}
              className="font-mono text-2xl font-extrabold text-[#2447A8] leading-none tabular-nums"
            >
              {rec.totalScore}
              <span className="text-xs font-semibold text-[#64748B] ml-0.5">
                /100
              </span>
            </span>
            <span className="text-[11px] font-medium text-[#17243B] text-right">
              {rec.historicalReliabilityScore !== null
                ? `Confidence: ${rec.dataConfidence}`
                : 'Verified timetable score'}
            </span>
          </div>
        ) : (
          <div className="text-xs font-semibold text-amber-900 pt-0.5">
            {rec.scoreStatusMessage ||
              'Score unavailable — insufficient verified data.'}
          </div>
        )}

        <p className="text-[10px] text-[#64748B] leading-snug pt-0.5">
          {rec.scheduleDisclaimer ||
            'Schedule-based recommendation only — not a guarantee of punctuality.'}
        </p>
      </div>
    );
  };

  const renderJourneyDetailsPanel = (route: MultiRouteCandidate, idx: number) => {
    const rec = route.recommendation;
    const hasVerifiedTotalDist =
      route.distanceReliable !== false && route.totalDistanceKm > 0;
    const range = route.verifiedDistanceRangeKm;

    return (
      <div
        data-testid={`route-journey-details-panel-${idx + 1}`}
        className="mt-3 pt-3 border-t border-[#E6EAF0] bg-[#F8FAFC] rounded-xl p-3.5 sm:p-4 space-y-3 text-xs"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Distance Verification & Source Breakdown */}
          <div className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-xl p-3.5 space-y-2">
            <div className="font-bold text-[#17243B] flex items-center justify-between gap-2">
              <span>Railway Distance Verification</span>
              <span
                className={`font-mono text-[11px] px-2 py-0.5 rounded-md font-semibold ${
                  hasVerifiedTotalDist
                    ? 'bg-[#15803D]/10 text-[#15803D] border border-[#15803D]/20'
                    : 'bg-amber-50 text-amber-800 border border-amber-200'
                }`}
              >
                {hasVerifiedTotalDist
                  ? `${route.totalDistanceKm} km Verified`
                  : 'Incomplete Distance'}
              </span>
            </div>

            <div className="text-[#64748B] text-[11px]">
              {hasVerifiedTotalDist ? (
                <>
                  <div>
                    <strong className="text-[#17243B]">Source:</strong>{' '}
                    {route.distanceSourceLabel ||
                      'Verified from Indian Railways timetable'}
                  </div>
                  {range && range.minKm !== range.maxKm && (
                    <div className="mt-0.5 font-mono text-[#64748B]">
                      Verified corridor distance range across candidate trains:{' '}
                      <strong className="text-[#17243B]">
                        {range.minKm}–{range.maxKm} km
                      </strong>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-amber-800 font-medium">
                  {route.distanceIncompleteDetail ||
                    'Distance incomplete — distance data unavailable for one leg.'}{' '}
                  ({route.distanceStatusMessage || MISSING_TOTAL_DISTANCE_MESSAGE})
                </div>
              )}
            </div>

            <div className="space-y-1.5 pt-1.5 border-t border-[#E6EAF0]">
              {route.selectedLegs.map((leg, lIdx) => {
                const legVerified =
                  leg.distanceReliable !== false && leg.distanceKm > 0;
                return (
                  <div
                    key={`${leg.trainNumber}_${lIdx}`}
                    className="flex flex-wrap items-center justify-between gap-2 text-[11px]"
                  >
                    <span className="font-medium text-[#17243B]">
                      Leg {lIdx + 1}: {leg.fromStationCode} → {leg.toStationCode}{' '}
                      (<span className="font-mono font-semibold text-[#2447A8]">{leg.trainNumber}</span>)
                    </span>
                    <span
                      className={`font-mono ${
                        legVerified
                          ? 'text-[#17243B] font-semibold'
                          : 'text-amber-800'
                      }`}
                    >
                      {legVerified
                        ? `${leg.distanceKm} km (${
                            leg.distanceSource ===
                            'VERIFIED_TIMETABLE_CUMULATIVE_KM'
                              ? 'Train Stop Km'
                              : 'Corridor Timetable Km'
                          })`
                        : 'Distance unavailable in dataset'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recommendation Score Factor Breakdown */}
          <div className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-xl p-3.5 space-y-2">
            <div className="font-bold text-[#17243B] flex items-center justify-between gap-2">
              <span>Recommendation Factor Breakdown</span>
              <span className="font-mono font-bold text-[#2447A8]">
                {rec.scoreAvailable !== false
                  ? `${rec.totalScore}/100`
                  : 'Unavailable'}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="bg-[#F8FAFC] px-2.5 py-1.5 rounded-lg border border-[#E6EAF0] flex items-center justify-between">
                <span className="text-[#64748B]">Distance:</span>
                <strong className="text-[#17243B]">
                  {rec.distanceEfficiencyScore}/100
                </strong>
              </div>
              <div className="bg-[#F8FAFC] px-2.5 py-1.5 rounded-lg border border-[#E6EAF0] flex items-center justify-between">
                <span className="text-[#64748B]">Transfer Buffer:</span>
                <strong className="text-[#17243B]">
                  {rec.connectionSafetyScore}/100
                </strong>
              </div>
              <div className="bg-[#F8FAFC] px-2.5 py-1.5 rounded-lg border border-[#E6EAF0] flex items-center justify-between">
                <span className="text-[#64748B]">Duration:</span>
                <strong className="text-[#17243B]">
                  {rec.journeyDurationScore}/100
                </strong>
              </div>
              <div className="bg-[#F8FAFC] px-2.5 py-1.5 rounded-lg border border-[#E6EAF0] flex items-center justify-between">
                <span className="text-[#64748B]">Fewest Legs:</span>
                <strong className="text-[#17243B]">
                  {rec.transferComplexityScore}/100
                </strong>
              </div>
            </div>

            <p className="text-[11px] text-[#64748B] leading-relaxed">
              Calculated from verified journey duration, rail distance efficiency vs
              direct baseline, number of train transfers, and scheduled layover margin.
            </p>
          </div>
        </div>
      </div>
    );
  };

  // ============================================================================
  // PHASE 4 SCREEN 3: TRAIN OPTIONS FOR SELECTED ROUTE
  // ============================================================================
  if (activeRouteId) {
    const selectedIndexInSorted = filteredAndSortedRoutes.findIndex(
      (r) => r.routeId === activeRouteId
    );
    const routeOptionNumber =
      selectedIndexInSorted >= 0
        ? selectedIndexInSorted + 1
        : Math.max(
            1,
            allEvaluatedRoutes.findIndex((r) => r.routeId === activeRouteId) + 1
          );
    const route =
      filteredAndSortedRoutes[selectedIndexInSorted] ||
      allEvaluatedRoutes.find((r) => r.routeId === activeRouteId);

    if (!route) {
      return (
        <div className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-2xl p-6 sm:p-8 space-y-4 text-center rp-shadow-card">
          <p className="text-base font-bold text-[#17243B]">
            Selected route option is no longer available under the current filter.
          </p>
          <p className="text-xs text-[#64748B]">
            The route or train combination might have been excluded by active filter settings.
          </p>
          <button
            type="button"
            onClick={() => {
              if (onBackToResults) onBackToResults();
              else setInternalSelectedRouteId(null);
            }}
            className="px-4 py-2 bg-[#2447A8] hover:bg-[#1D3B8E] text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
          >
            ← Back to Route Results
          </button>
        </div>
      );
    }

    const hasVerifiedTotalDist =
      route.distanceReliable !== false && route.totalDistanceKm > 0;
    const totalTransferWaitMin = route.transfers.reduce(
      (sum, tx) => sum + tx.scheduledLayoverMinutes,
      0
    );
    // Expandable calculation panel defaults to collapsed for a clean, distraction-free journey planning experience
    const detailsOpen = expandedDetailsByRoute[route.routeId] ?? false;

    return (
      <div
        data-testid="selected-route-train-options-screen"
        className="space-y-4 sm:space-y-5 screen-transition"
      >
        {/* 1. Top Journey Header */}
        <div className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-2xl p-4 sm:p-5 rp-shadow-card flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              data-testid="back-to-results-btn"
              onClick={() => {
                if (onBackToResults) onBackToResults();
                else setInternalSelectedRouteId(null);
              }}
              className="inline-flex items-center gap-2 px-3.5 py-2 bg-[#F8FAFC] hover:bg-[#EEF2F7] border border-[#E6EAF0] text-[#17243B] text-xs font-semibold rounded-xl transition-all cursor-pointer shadow-xs"
            >
              <ArrowLeft className="w-4 h-4 text-[#2447A8]" />
              <span>Back to Route Results</span>
            </button>

            <div className="flex flex-wrap items-center gap-2 text-xs text-[#64748B]">
              <span className="font-mono font-bold text-[#2447A8] bg-[#2447A8]/10 px-2.5 py-1 rounded-lg">
                Option {routeOptionNumber}
              </span>
              <span className="text-[#CBD5E1]" aria-hidden="true">·</span>
              <span className="font-bold text-[#17243B]">
                {route.stationNamesSequence[0]} ({route.stationSequence[0]})
                {' → '}
                {route.stationNamesSequence[route.stationNamesSequence.length - 1]} ({route.stationSequence[route.stationSequence.length - 1]})
              </span>
              <span className="text-[#CBD5E1]" aria-hidden="true">·</span>
              <span>
                Date: <strong className="text-[#17243B] font-medium">{searchData.journeyDate}</strong>
              </span>
              <span className="text-[#CBD5E1]" aria-hidden="true">·</span>
              <span>
                <strong className="text-[#17243B] font-medium">{route.selectedLegs.length}</strong> legs
              </span>
            </div>
          </div>

          {onEditSearch && (
            <button
              type="button"
              data-testid="train-options-edit-search-btn"
              onClick={onEditSearch}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#FFFFFF] border border-[#E6EAF0] hover:border-[#2447A8] text-[#17243B] hover:text-[#2447A8] text-xs font-semibold rounded-xl transition-colors cursor-pointer"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Modify Search</span>
            </button>
          )}
        </div>

        {/* 2. Selected Route Summary Card */}
        <div className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-2xl p-4 sm:p-5 rp-shadow-card space-y-4">
          <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-5">
            <div className="space-y-3 flex-1 min-w-0">
              {/* Badges Row */}
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono font-bold text-white bg-[#2447A8] px-2.5 py-0.5 rounded-md">
                  Option {routeOptionNumber}
                </span>
                {route.recommendationBadge && (
                  <span className="font-bold text-[#2447A8] bg-[#2447A8]/10 border border-[#2447A8]/20 px-2.5 py-0.5 rounded-md">
                    {route.recommendationBadge}
                  </span>
                )}
                <span className="font-semibold text-[#17243B] bg-[#F8FAFC] border border-[#E6EAF0] px-2.5 py-0.5 rounded-md">
                  {route.recommendationLabel}
                </span>
                <span className="text-[#64748B] font-medium">
                  {route.selectedLegs.length} legs ·{' '}
                  {route.numberOfTransfers === 1
                    ? '1 train change'
                    : `${route.numberOfTransfers} train changes`}
                </span>
                {customSelections[route.routeId] && (
                  <span className="text-[#2447A8] font-semibold bg-[#2447A8]/10 border border-[#2447A8]/20 px-2 py-0.5 rounded-md">
                    Custom train selection active
                  </span>
                )}
              </div>

              {/* Station Corridor Flow */}
              <div className="flex flex-wrap items-center gap-2 pt-0.5">
                {route.stationSequence.map((stCode, sIdx) => {
                  const isInterchange =
                    sIdx > 0 && sIdx < route.stationSequence.length - 1;
                  return (
                    <React.Fragment key={stCode}>
                      <div className="flex items-baseline gap-1.5">
                        <span
                          className={`text-base sm:text-lg font-bold ${
                            isInterchange ? 'text-[#2447A8]' : 'text-[#17243B]'
                          }`}
                        >
                          {route.stationNamesSequence[sIdx]}
                        </span>
                        <span
                          className={`font-mono text-xs font-bold ${
                            isInterchange ? 'text-[#2447A8]' : 'text-[#64748B]'
                          }`}
                        >
                          ({stCode})
                        </span>
                        {isInterchange && (
                          <span className="text-[10px] uppercase font-bold text-[#168A83] bg-[#168A83]/10 px-1.5 py-0.5 rounded">
                            Transfer
                          </span>
                        )}
                      </div>
                      {sIdx < route.stationSequence.length - 1 && (
                        <ArrowRight className="w-4 h-4 text-[#94A3B8] shrink-0" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>

              {/* Clean Horizontal Key Metrics Grid on desktop, organized stack on mobile */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                {/* Metric 1: Verified Total Rail Distance */}
                <div className="bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-[#64748B]">
                    Verified Distance
                  </div>
                  <div
                    data-testid={`route-distance-summary-${routeOptionNumber}`}
                    className={`font-mono text-sm sm:text-base font-bold mt-0.5 ${
                      hasVerifiedTotalDist ? 'text-[#17243B]' : 'text-amber-800'
                    }`}
                  >
                    {hasVerifiedTotalDist
                      ? `${route.totalDistanceKm} km`
                      : 'Incomplete'}
                  </div>
                  <div className="text-[10px] text-[#64748B] mt-0.5 truncate">
                    {hasVerifiedTotalDist &&
                    route.baselineDistanceKm > 0 &&
                    route.extraDistanceKm > 0
                      ? `+${route.extraDistanceKm} km vs direct`
                      : 'Cumulative rail km'}
                  </div>
                </div>

                {/* Metric 2: Total Journey Duration */}
                <div className="bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-[#64748B]">
                    Total Journey
                  </div>
                  <div className="font-mono text-sm sm:text-base font-bold text-[#17243B] mt-0.5">
                    {formatDuration(route.totalDurationMinutes)}
                  </div>
                  <div className="text-[10px] text-[#64748B] mt-0.5">
                    Including transfers
                  </div>
                </div>

                {/* Metric 3: Total Transfer Waiting Time */}
                <div className="bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-[#64748B]">
                    Transfer Layover
                  </div>
                  <div className="font-mono text-sm sm:text-base font-bold text-[#17243B] mt-0.5">
                    {formatDuration(totalTransferWaitMin)}
                  </div>
                  <div className="text-[10px] text-[#64748B] mt-0.5">
                    {route.numberOfTransfers === 1
                      ? '1 interchange'
                      : `${route.numberOfTransfers} interchanges`}
                  </div>
                </div>

                {/* Metric 4: Connection Buffer Status */}
                <div className="bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl p-3">
                  <div className="text-[10px] uppercase font-bold tracking-wider text-[#64748B]">
                    Transfer Buffer
                  </div>
                  <div className="mt-1">
                    {renderRiskIndicator(
                      route.overallRiskLevel,
                      route.overallRiskStatus
                    )}
                  </div>
                  <div className="text-[10px] text-[#64748B] mt-0.5 truncate">
                    Target: {targetBufferMinutes}m min
                  </div>
                </div>
              </div>
            </div>

            {/* Prominent Recommendation Score Box (never duplicated) */}
            <div className="w-full lg:w-72 shrink-0">
              {renderRecommendationScoreBox(route, routeOptionNumber - 1)}
            </div>
          </div>

          {/* Active Train Combination Summary & Transfer Timeline Strip */}
          <div className="bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl p-4 space-y-3.5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <GitCommit className="w-4 h-4 text-[#2447A8] shrink-0" />
                <h3 className="text-xs font-bold text-[#17243B]">
                  Active Selected Train Combination
                </h3>
                <span className="text-[11px] font-mono text-[#64748B]">
                  (Target buffer: {targetBufferMinutes}m)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => toggleRouteDetails(route.routeId)}
                  className="px-3 py-1.5 bg-[#FFFFFF] border border-[#E6EAF0] hover:border-[#2447A8] text-[#17243B] hover:text-[#2447A8] text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer shadow-xs"
                >
                  <Info className="w-3.5 h-3.5 text-[#2447A8]" />
                  <span>
                    {detailsOpen
                      ? 'Hide Calculation Details'
                      : 'View Calculation Details'}
                  </span>
                </button>

                {customSelections[route.routeId] && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomSelections((prev) => {
                        const copy = { ...prev };
                        delete copy[route.routeId];
                        return copy;
                      });
                    }}
                    className="text-xs text-[#2447A8] font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Reset to Default</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() =>
                    onOpenCompareTrains(
                      route.selectedLegs[0].trainNumber,
                      route.selectedLegs[1].trainNumber,
                      route.interchangeStations[0].code
                    )
                  }
                  className="px-3 py-1.5 bg-[#FFFFFF] border border-[#E6EAF0] hover:border-[#2447A8] text-[#17243B] hover:text-[#2447A8] text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer shadow-xs"
                >
                  <Activity className="w-3.5 h-3.5 text-[#2447A8]" />
                  <span>Monitor Connection Live</span>
                </button>
              </div>
            </div>

            {/* Selected Train Chain */}
            <div className="flex flex-wrap items-center gap-2.5 text-xs">
              {route.selectedLegs.map((leg, lIdx) => (
                <React.Fragment key={`${leg.trainNumber}_${lIdx}`}>
                  <div className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-xl px-3.5 py-2.5 flex-1 min-w-[220px]">
                    <div className="flex items-center gap-2 font-semibold text-[#17243B]">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                        Leg {lIdx + 1}:
                      </span>
                      <span className="font-mono text-xs font-bold text-[#2447A8] bg-[#2447A8]/10 px-1.5 py-0.5 rounded">
                        {leg.trainNumber}
                      </span>
                      <span className="truncate text-xs font-bold text-[#17243B]">
                        {leg.trainName}
                      </span>
                    </div>
                    <div className="text-[#64748B] font-mono text-[11px] mt-1 flex flex-wrap items-center gap-1.5">
                      <span>
                        {leg.fromStationCode} {leg.departureTime}
                      </span>
                      <span className="text-[#CBD5E1]" aria-hidden="true">
                        →
                      </span>
                      <span>
                        {leg.toStationCode} {leg.arrivalTime}
                      </span>
                      <span className="text-[#CBD5E1]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-[#17243B] font-medium">
                        {formatDuration(leg.durationMinutes)}
                      </span>
                      <span className="text-[#CBD5E1]" aria-hidden="true">
                        ·
                      </span>
                      <span className="text-[#2447A8] font-medium">
                        {leg.distanceReliable !== false && leg.distanceKm > 0
                          ? `${leg.distanceKm} km`
                          : 'Distance unavailable'}
                      </span>
                    </div>
                  </div>
                  {lIdx < route.transfers.length && (
                    <div className="text-center px-2 py-1 bg-[#FFFFFF] border border-[#E6EAF0] rounded-lg shrink-0">
                      <div className="font-mono text-[11px] font-bold text-[#2447A8]">
                        Wait{' '}
                        {formatDuration(
                          route.transfers[lIdx].scheduledLayoverMinutes
                        )}
                      </div>
                      <div className="text-[10px] text-[#64748B]">
                        at {route.transfers[lIdx].interchangeStationCode}
                      </div>
                    </div>
                  )}
                </React.Fragment>
              ))}
            </div>

            {/* Interchange Evaluation & Transfer Timeline */}
            {route.transfers.map((tx, txIdx) => (
              <div
                key={`${tx.interchangeStationCode}_${txIdx}`}
                className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-xl p-3.5 text-xs space-y-2"
              >
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2 pb-2 border-b border-[#E6EAF0]">
                  <div className="font-semibold text-[#17243B] flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-xs font-bold text-[#2447A8] bg-[#2447A8]/10 px-2 py-0.5 rounded">
                      Transfer {txIdx + 1}
                    </span>
                    <span>
                      at {tx.interchangeStationName} ({tx.interchangeStationCode})
                    </span>
                    <span className="text-[#64748B] font-normal text-[11px]">
                      — Same physical station (Min{' '}
                      {tx.platformTransferMarginMinutes}m platform transfer)
                    </span>
                  </div>
                  <div>{renderRiskIndicator(tx.riskLevel, tx.riskStatus)}</div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] font-mono text-[#64748B]">
                  <div className="bg-[#F8FAFC] border border-[#E6EAF0] rounded-lg p-2">
                    <div className="text-[10px] text-[#64748B] uppercase tracking-wider">
                      Incoming Train
                    </div>
                    <div className="text-[#17243B] font-bold mt-0.5">
                      #{tx.incomingTrainNumber} Arr {tx.scheduledArrivalTime}
                    </div>
                    <div className="text-[10px] text-[#64748B]">
                      ({tx.scheduledArrivalDate})
                    </div>
                  </div>

                  <div className="bg-[#F8FAFC] border border-[#E6EAF0] rounded-lg p-2">
                    <div className="text-[10px] text-[#64748B] uppercase tracking-wider">
                      Connecting Train
                    </div>
                    <div className="text-[#17243B] font-bold mt-0.5">
                      #{tx.outgoingTrainNumber} Dep {tx.scheduledDepartureTime}
                    </div>
                    <div className="text-[10px] text-[#64748B]">
                      ({tx.scheduledDepartureDate})
                    </div>
                  </div>

                  <div className="bg-[#F8FAFC] border border-[#E6EAF0] rounded-lg p-2">
                    <div className="text-[10px] text-[#64748B] uppercase tracking-wider">
                      Transfer Layover
                    </div>
                    <div className="text-[#2447A8] font-bold mt-0.5">
                      {formatDuration(tx.scheduledLayoverMinutes)} scheduled wait
                    </div>
                    <div className="text-[10px] text-[#64748B]">
                      {tx.scheduledLayoverMinutes >= targetBufferMinutes
                        ? 'Meets target buffer'
                        : 'Tighter than target buffer'}
                    </div>
                  </div>
                </div>

                <div className="text-[#64748B] text-[11px] flex flex-col sm:flex-row sm:items-center justify-between gap-1 pt-1 border-t border-[#F1F5F9]">
                  <div className="truncate">
                    {tx.riskReasons.join(' · ')}
                  </div>
                  <div className="text-[10px] text-[#94A3B8] shrink-0">
                    Schedule evaluation only — live punctuality not guaranteed
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Expandable Technical Details Panel (Distance & Score Formula breakdown) */}
          {detailsOpen &&
            renderJourneyDetailsPanel(route, routeOptionNumber - 1)}
        </div>

        {/* 3. Separate Leg-by-Leg Train Selection Columns */}
        <div
          data-testid={`expanded-route-trains-${routeOptionNumber}`}
          className={`grid grid-cols-1 ${
            route.availableTrainsByLeg.length >= 3
              ? 'lg:grid-cols-3'
              : 'lg:grid-cols-2'
          } gap-4`}
        >
          {route.availableTrainsByLeg.map((legOptions, legIdx) => {
            const activeLeg = route.selectedLegs[legIdx];
            const expectedFromCode = route.stationSequence[legIdx];
            const expectedToCode = route.stationSequence[legIdx + 1];
            const expectedFromName = route.stationNamesSequence[legIdx];
            const expectedToName = route.stationNamesSequence[legIdx + 1];

            return (
              <div
                key={legIdx}
                data-testid={`route-${routeOptionNumber}-leg-${legIdx + 1}-column`}
                className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-2xl p-4 sm:p-5 rp-shadow-card space-y-3.5"
              >
                <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#E6EAF0]">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#168A83] block">
                      Leg {legIdx + 1} of {route.availableTrainsByLeg.length}
                    </span>
                    <h4 className="text-sm sm:text-base font-bold text-[#17243B]">
                      {expectedFromName} ({expectedFromCode}) → {expectedToName} (
                      {expectedToCode})
                    </h4>
                  </div>
                  <span className="text-xs text-[#64748B] font-mono bg-[#F8FAFC] border border-[#E6EAF0] px-2.5 py-1 rounded-lg shrink-0">
                    {legOptions.length} verified{' '}
                    {legOptions.length === 1 ? 'train' : 'trains'}
                  </span>
                </div>

                <div className="space-y-3">
                  {legOptions.map((opt) => {
                    const isSelected =
                      activeLeg.trainNumber === opt.trainNumber;
                    const displayBoardingDate = isSelected
                      ? activeLeg.boardingDate
                      : opt.boardingDate;
                    const displayArrivalDate = isSelected
                      ? activeLeg.arrivalDate
                      : opt.arrivalDate;
                    const hasVerifiedLegKm =
                      opt.distanceReliable !== false && opt.distanceKm > 0;

                    return (
                      <div
                        key={opt.trainNumber}
                        data-testid={`route-${routeOptionNumber}-leg-${legIdx + 1}-train-${opt.trainNumber}`}
                        className={`p-4 rounded-xl border transition-all ${
                          isSelected
                            ? 'border-[#2447A8] bg-[#2447A8]/[0.02] shadow-[0_2px_8px_rgba(36,71,168,0.08)]'
                            : 'border-[#E6EAF0] bg-[#FFFFFF] hover:border-[#CBD5E1] hover:bg-[#F8FAFC]/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-2 min-w-0 flex-1">
                            {/* Train Number & Train Name */}
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-mono text-xs font-bold text-[#2447A8] bg-[#2447A8]/10 border border-[#2447A8]/20 px-2 py-0.5 rounded-md">
                                {opt.trainNumber}
                              </span>
                              <span className="text-xs sm:text-sm font-bold text-[#17243B] truncate">
                                {opt.trainName}
                              </span>
                            </div>

                            {/* Boarding & Arrival Timeline */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-[11px] font-mono text-[#64748B] pt-0.5">
                              <div className="bg-[#F8FAFC] border border-[#E6EAF0] rounded-lg p-2">
                                <span className="text-[10px] text-[#64748B] uppercase tracking-wider block">
                                  Boarding
                                </span>
                                <div className="text-[#17243B] font-bold text-xs mt-0.5">
                                  {opt.departureTime}
                                </div>
                                <div className="text-[#64748B] truncate">
                                  {opt.fromStationName} ({opt.fromStationCode})
                                </div>
                                <div className="text-[10px] text-[#64748B]">
                                  ({displayBoardingDate})
                                </div>
                              </div>

                              <div className="bg-[#F8FAFC] border border-[#E6EAF0] rounded-lg p-2">
                                <span className="text-[10px] text-[#64748B] uppercase tracking-wider block">
                                  Arrival
                                </span>
                                <div className="text-[#17243B] font-bold text-xs mt-0.5">
                                  {opt.arrivalTime}
                                </div>
                                <div className="text-[#64748B] truncate">
                                  {opt.toStationName} ({opt.toStationCode})
                                </div>
                                <div className="text-[10px] text-[#64748B]">
                                  ({displayArrivalDate})
                                </div>
                              </div>
                            </div>

                            {/* Journey Duration & Verified Segment Distance */}
                            <div className="text-[11px] font-mono text-[#64748B] flex flex-wrap items-center gap-2 pt-0.5">
                              <span>
                                Duration:{' '}
                                <strong className="text-[#17243B]">
                                  {formatDuration(opt.durationMinutes)}
                                </strong>
                              </span>
                              <span
                                className="text-[#CBD5E1]"
                                aria-hidden="true"
                              >
                                ·
                              </span>
                              <span
                                className={
                                  hasVerifiedLegKm
                                    ? 'text-[#2447A8] font-semibold'
                                    : 'text-amber-800'
                                }
                              >
                                {hasVerifiedLegKm
                                  ? `${opt.distanceKm} km (verified rail)`
                                  : 'Segment distance unavailable'}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-col items-end gap-2 shrink-0">
                            <button
                              type="button"
                              data-testid={`select-train-btn-route-${routeOptionNumber}-leg-${legIdx + 1}-${opt.trainNumber}`}
                              onClick={() =>
                                handleLegTrainSelect(route, legIdx, opt)
                              }
                              className={`px-3.5 py-1.5 text-xs font-semibold rounded-xl cursor-pointer transition-all ${
                                isSelected
                                  ? 'bg-[#2447A8] text-white shadow-[0_2px_6px_rgba(36,71,168,0.25)]'
                                  : 'bg-[#F8FAFC] hover:bg-[#EEF2F7] border border-[#E6EAF0] text-[#17243B]'
                              }`}
                            >
                              {isSelected ? 'Selected' : 'Select Train'}
                            </button>

                            <button
                              type="button"
                              onClick={() => onOpenLiveStatus(opt.trainNumber)}
                              className="text-[11px] font-semibold text-[#2447A8] hover:text-[#1D3B8E] hover:underline cursor-pointer inline-flex items-center gap-0.5"
                            >
                              <span>Live Status</span>
                              <span>→</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  // ============================================================================
  // PHASE 2 SCREEN 2: ROUTE RESULTS SUMMARY SCREEN
  // ============================================================================
  return (
    <div className="space-y-4 sm:space-y-5 screen-transition">
      {/* 1. Direct Train Priority Banner when Direct Trains exist */}
      {verifiedDirectTrains.length > 0 ? (
        <div
          data-testid="direct-trains-priority-banner"
          className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-2xl p-4 sm:p-5 rp-shadow-card space-y-3"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#15803D]">
                <span
                  aria-hidden="true"
                  className="w-2 h-2 rounded-full bg-[#15803D]"
                />
                <span className="uppercase tracking-wider text-[11px] font-bold">
                  Direct Service Priority — {verifiedDirectTrains.length} Direct Train{verifiedDirectTrains.length === 1 ? '' : 's'} Found
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-bold text-[#17243B]">
                {searchData.originName} ({searchData.originCode}) → {searchData.destinationName} ({searchData.destinationCode})
              </h3>
            </div>
            {onSwitchToDirect && (
              <button
                type="button"
                onClick={onSwitchToDirect}
                className="px-3.5 py-2 bg-[#2447A8] hover:bg-[#1D3B8E] text-white text-xs font-semibold rounded-xl shadow-[0_2px_6px_rgba(36,71,168,0.2)] transition-all whitespace-nowrap shrink-0 cursor-pointer"
              >
                Inspect Direct Timetable →
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            {verifiedDirectTrains.map((dt) => (
              <div
                key={dt.trainNumber}
                className="bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl p-3.5 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-bold text-[#17243B]">
                    <span className="font-mono text-[#2447A8]">
                      {dt.trainNumber}
                    </span>
                    <span className="text-[#CBD5E1]" aria-hidden="true">·</span>
                    <span className="truncate">{dt.trainName}</span>
                  </div>
                  <div className="text-xs font-mono text-[#64748B] mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="text-[#17243B] font-semibold">
                      {dt.departureTime} → {dt.arrivalTime}
                    </span>
                    <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
                    <span>{formatDuration(dt.durationMinutes)}</span>
                    <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
                    <span className="text-[#2447A8] font-semibold">
                      {dt.distanceReliable !== false && dt.distanceKm > 0
                        ? `${dt.distanceKm} km verified`
                        : 'Distance unavailable'}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenLiveStatus(dt.trainNumber)}
                  className="px-2.5 py-1.5 bg-[#FFFFFF] hover:bg-[#EEF2F7] border border-[#E6EAF0] text-xs font-semibold text-[#17243B] hover:text-[#2447A8] rounded-lg transition-colors shrink-0 cursor-pointer"
                >
                  Status →
                </button>
              </div>
            ))}
          </div>
          <p className="text-xs text-[#64748B] pt-0.5">
            Connecting multi-train routes are searched separately and listed below as flexible alternatives.
          </p>
        </div>
      ) : (
        filteredAndSortedRoutes.length > 0 && (
          <div
            data-testid="no-direct-trains-notice"
            className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-2xl p-4 text-xs text-[#64748B] rp-shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-2"
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="w-2 h-2 rounded-full bg-[#168A83] shrink-0"
              />
              <div>
                <strong className="text-[#17243B] font-semibold">
                  No Direct Train on this Date:
                </strong>{' '}
                {searchData.diagnostics?.summary ||
                  `Connecting interchange routes are available below for ${searchData.originCode} → ${searchData.destinationCode}.`}
              </div>
            </div>
            <span className="font-mono text-[11px] text-[#2447A8] font-bold shrink-0">
              {filteredAndSortedRoutes.length} connecting route{filteredAndSortedRoutes.length === 1 ? '' : 's'}
            </span>
          </div>
        )
      )}

      {/* 2. Compact Control & Sort Bar + Expandable Filters Panel */}
      <div className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-2xl p-4 sm:p-5 rp-shadow-card space-y-3.5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3.5 pb-3.5 border-b border-[#E6EAF0]">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#17243B]">
              {verifiedDirectTrains.length > 0
                ? `Alternative Connecting Routes (${filteredAndSortedRoutes.length})`
                : `Connecting Route Options (${filteredAndSortedRoutes.length})`}
            </h2>
            <p className="text-xs text-[#64748B] mt-0.5 flex flex-wrap items-center gap-1.5">
              <span>
                {searchData.baselineDistanceKm > 0
                  ? searchData.baselineType === 'DIRECT_TRAIN_BASELINE'
                    ? 'Direct Rail Baseline: '
                    : 'Shortest Network Rail Baseline: '
                  : 'Rail Baseline: '}
              </span>
              <strong className="font-mono font-semibold text-[#17243B]">
                {searchData.baselineDistanceKm > 0
                  ? `${searchData.baselineDistanceKm} km`
                  : 'Unavailable'}
              </strong>
              <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
              <span>Buffer: ≥{targetBufferMinutes}m</span>
              <span aria-hidden="true" className="text-[#CBD5E1]">·</span>
              <span>Max Detour: +{maxDetourPct}%</span>
            </p>
          </div>

          {/* Sort Controls & Filter Toggle Button */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Horizontal Sort Tabs */}
            <div
              role="tablist"
              aria-label="Route Sort Options"
              className="inline-flex p-1 bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl overflow-x-auto max-w-full"
            >
              {(
                [
                  { id: 'distance', label: 'Lowest Distance' },
                  { id: 'duration', label: 'Shortest Duration' },
                  { id: 'recommendation', label: 'Best Recommendation' },
                  { id: 'safety', label: 'Safest Connections' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setSortBy(opt.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                    sortBy === opt.id
                      ? 'bg-[#FFFFFF] text-[#2447A8] shadow-xs font-bold'
                      : 'text-[#64748B] hover:text-[#17243B]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Expandable Filter Toggle */}
            <button
              type="button"
              onClick={() => setIsFiltersOpen((prev) => !prev)}
              aria-expanded={isFiltersOpen}
              className={`h-[34px] px-3 text-xs font-semibold rounded-xl border transition-all inline-flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                isFiltersOpen || hasActiveCustomFilters
                  ? 'bg-[#F8FAFC] border-[#2447A8] text-[#2447A8]'
                  : 'bg-[#FFFFFF] border-[#E6EAF0] text-[#64748B] hover:text-[#17243B]'
              }`}
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#168A83]" />
              <span>Filters</span>
              {hasActiveCustomFilters && (
                <span
                  aria-hidden="true"
                  className="w-1.5 h-1.5 rounded-full bg-[#168A83]"
                />
              )}
              {isFiltersOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-[#64748B]" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-[#64748B]" />
              )}
            </button>
          </div>
        </div>

        {/* Expandable Filters Panel */}
        {isFiltersOpen && (
          <div className="pt-2 pb-1 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-[#F8FAFC] border border-[#E6EAF0] rounded-xl text-xs">
              {/* Transfer Buffer */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#17243B]">
                    Target Transfer Buffer
                  </span>
                  <span className="font-mono font-bold text-[#2447A8]">
                    {targetBufferMinutes}m ({formatDuration(targetBufferMinutes)})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { min: 150, label: '150m' },
                    { min: 180, label: '180m Target' },
                    { min: 240, label: '240m Safer' },
                  ].map((preset) => (
                    <button
                      key={preset.min}
                      type="button"
                      onClick={() => {
                        setCustomBufferInput(String(preset.min));
                        onUpdateBuffer(preset.min);
                      }}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        targetBufferMinutes === preset.min
                          ? 'bg-[#2447A8] text-white border-[#2447A8] font-semibold'
                          : 'bg-[#FFFFFF] text-[#17243B] border-[#E6EAF0] hover:bg-[#EEF2F7]'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      min={45}
                      max={600}
                      step={15}
                      value={customBufferInput}
                      aria-label="Custom transfer buffer in minutes"
                      onChange={(e) => {
                        setCustomBufferInput(e.target.value);
                        const val = parseInt(e.target.value, 10);
                        if (!Number.isNaN(val) && val >= 45 && val <= 600) {
                          onUpdateBuffer(val);
                        }
                      }}
                      className="w-14 px-2 py-1 text-xs font-mono bg-[#FFFFFF] border border-[#E6EAF0] rounded-lg text-center font-semibold text-[#17243B]"
                    />
                    <span className="text-[11px] text-[#64748B]">min</span>
                  </div>
                </div>
              </div>

              {/* Max Acceptable Detour Filter */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#17243B]">
                    Max Rail Detour Limit
                  </span>
                  <span className="font-mono text-[#64748B]">
                    Up to +{maxDetourPct}%
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[
                    { pct: 25, label: '+25% Default' },
                    { pct: 50, label: '+50% Extended' },
                    { pct: 100, label: 'Show All (+100%)' },
                  ].map((d) => (
                    <button
                      key={d.pct}
                      type="button"
                      onClick={() => onUpdateMaxDetour(d.pct)}
                      className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer ${
                        maxDetourPct === d.pct
                          ? 'bg-[#17243B] text-white border-[#17243B] font-semibold'
                          : 'bg-[#FFFFFF] text-[#17243B] border-[#E6EAF0] hover:bg-[#EEF2F7]'
                      }`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Category Filter & Tighter Connection Toggle */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#17243B]">
                    Distance Category
                  </span>
                  <label className="inline-flex items-center gap-1.5 text-xs text-[#64748B] cursor-pointer">
                    <input
                      type="checkbox"
                      checked={includeTighterConnections}
                      onChange={(e) => onToggleTighter(e.target.checked)}
                      className="rounded border-[#E6EAF0] text-[#2447A8] focus:ring-[#2447A8]"
                    />
                    <span>Show tighter (&lt;{targetBufferMinutes}m)</span>
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-1">
                  {(
                    [
                      { id: 'ALL', label: 'All Routes' },
                      {
                        id: 'Low-distance alternatives',
                        label: 'Low-Distance (≤10%)',
                      },
                      {
                        id: 'Recommended alternatives',
                        label: 'Recommended (10–25%)',
                      },
                      {
                        id: 'Longer-distance alternatives',
                        label: 'Longer (>25%)',
                      },
                    ] as const
                  ).map((cat) => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategoryFilter(cat.id)}
                      className={`px-2 py-0.5 text-[11px] font-medium rounded-md transition-colors cursor-pointer ${
                        categoryFilter === cat.id
                          ? 'bg-[#FFFFFF] text-[#2447A8] font-bold shadow-2xs border border-[#E6EAF0]'
                          : 'text-[#64748B] hover:text-[#17243B]'
                      }`}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Hidden Longer Routes Notification */}
            {searchData.hiddenLongerRoutesCount > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B]">
                <span>
                  {searchData.hiddenLongerRoutesCount} longer alternative route(s) exceeding +{maxDetourPct}% detour are hidden.
                </span>
                <button
                  type="button"
                  onClick={() => onUpdateMaxDetour(100)}
                  className="font-semibold text-[#2447A8] hover:underline cursor-pointer"
                >
                  Show all alternatives (+100%) →
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 3. Connecting Route Options Cards List */}
      {filteredAndSortedRoutes.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-2xl p-6 sm:p-8 text-center space-y-3 rp-shadow-card">
          <p className="text-base font-bold text-[#17243B]">
            {verifiedDirectTrains.length > 0
              ? `${verifiedDirectTrains.length} Direct Train(s) Connect ${searchData.originCode} → ${searchData.destinationCode} Directly`
              : searchData.diagnostics?.status === 'NO_TRAINS_AT_ORIGIN' ||
                searchData.diagnostics?.status === 'NO_TRAINS_AT_DESTINATION'
              ? 'Insufficient Timetable Coverage in Dataset Snapshot'
              : 'No Feasible Connecting Route Matches Current Criteria'}
          </p>
          <p className="text-xs text-[#64748B] max-w-xl mx-auto leading-relaxed">
            {searchData.diagnostics?.summary ||
              'Try expanding the Max Rail Detour limit to +100% or enabling tighter connections to inspect all candidate options.'}
          </p>
          <div className="flex justify-center gap-3 pt-2">
            {verifiedDirectTrains.length > 0 && onSwitchToDirect ? (
              <button
                type="button"
                onClick={onSwitchToDirect}
                className="px-4 py-2 bg-[#2447A8] text-white text-xs font-semibold rounded-xl hover:bg-[#1D3B8E] cursor-pointer"
              >
                View {verifiedDirectTrains.length} Direct Train(s) →
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setCategoryFilter('ALL');
                  onUpdateMaxDetour(100);
                  onToggleTighter(true);
                }}
                className="px-4 py-2 bg-[#2447A8] text-white text-xs font-semibold rounded-xl hover:bg-[#1D3B8E] cursor-pointer"
              >
                Reset Filters &amp; Show All
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3 sm:space-y-4" data-testid="route-options-list">
          {filteredAndSortedRoutes.map((route, idx) => {
            const hasVerifiedTotalDist =
              route.distanceReliable !== false && route.totalDistanceKm > 0;
            const totalTransferWaitMin = route.transfers.reduce(
              (sum, tx) => sum + tx.scheduledLayoverMinutes,
              0
            );
            const transferWaitSummary =
              route.transfers.length === 1
                ? `${formatDuration(
                    route.transfers[0].scheduledLayoverMinutes
                  )} layover at ${route.transfers[0].interchangeStationCode}`
                : `${formatDuration(
                    totalTransferWaitMin
                  )} total layover (${route.transfers
                    .map(
                      (tx) =>
                        `${tx.interchangeStationCode} ${formatDuration(
                          tx.scheduledLayoverMinutes
                        )}`
                    )
                    .join(' + ')})`;

            const recommendationText =
              route.recommendationLabel ||
              (hasVerifiedTotalDist
                ? 'Verified rail distance · Meets scheduled transfer buffer'
                : 'Meets scheduled transfer buffer');
            const isDetailsOpen = !!expandedDetailsByRoute[route.routeId];

            return (
              <div
                key={route.routeId}
                data-testid={`route-option-card-${idx + 1}`}
                data-route-id={route.routeId}
                className="bg-[#FFFFFF] border border-[#E6EAF0] hover:border-[#CBD5E1] rounded-2xl p-4 sm:p-5 rp-shadow-card transition-all"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  {/* Left & Center: Option Metadata, Visual Station Journey Timeline & Key Metrics */}
                  <div className="space-y-3 flex-1 min-w-0">
                    {/* Top Row: Option Number & Clean Unboxed Metadata */}
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-mono text-xs font-bold text-[#64748B] bg-[#F8FAFC] border border-[#E6EAF0] px-2 py-0.5 rounded-md">
                        Option {idx + 1}
                      </span>
                      {route.recommendationBadge && (
                        <span
                          data-testid={`recommendation-badge-${idx + 1}`}
                          className="font-bold text-white bg-[#2447A8] px-2 py-0.5 rounded-md text-[11px]"
                        >
                          {route.recommendationBadge}
                        </span>
                      )}
                      <span className="text-[#64748B] font-medium text-[11.5px]">
                        {recommendationText}
                      </span>
                      <span aria-hidden="true" className="text-[#CBD5E1]">
                        ·
                      </span>
                      <span className="text-[#17243B] font-semibold text-[11.5px]">
                        {route.selectedLegs.length} legs ·{' '}
                        {route.numberOfTransfers === 1
                          ? '1 train change'
                          : `${route.numberOfTransfers} train changes`}
                      </span>
                      {customSelections[route.routeId] && (
                        <span className="text-[#2447A8] font-semibold bg-[#F8FAFC] border border-[#E6EAF0] px-2 py-0.5 rounded-md text-[10.5px]">
                          Custom train selected
                        </span>
                      )}
                    </div>

                    {/* Middle: Visual Station Journey Timeline */}
                    <div className="flex flex-wrap items-center gap-2 py-1">
                      {route.stationSequence.map((stCode, sIdx) => {
                        const isInterchange =
                          sIdx > 0 && sIdx < route.stationSequence.length - 1;
                        const transferInfo = isInterchange
                          ? route.transfers[sIdx - 1]
                          : null;

                        return (
                          <React.Fragment key={`${stCode}_${sIdx}`}>
                            <div className="flex items-center gap-1.5">
                              <span
                                aria-hidden="true"
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                  sIdx === 0
                                    ? 'border-2 border-[#2447A8] bg-[#FFFFFF]'
                                    : isInterchange
                                    ? 'bg-[#168A83]'
                                    : 'bg-[#17243B]'
                                }`}
                              />
                              <div className="flex flex-col">
                                <span
                                  className={`text-sm sm:text-[15px] font-bold ${
                                    isInterchange
                                      ? 'text-[#168A83]'
                                      : 'text-[#17243B]'
                                  }`}
                                >
                                  {route.stationNamesSequence[sIdx]}
                                </span>
                                <span className="font-mono text-[11px] font-semibold text-[#64748B]">
                                  {stCode}
                                  {transferInfo && (
                                    <span className="text-[#168A83] font-normal ml-1">
                                      ({formatDuration(transferInfo.scheduledLayoverMinutes)} wait)
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>

                            {sIdx < route.stationSequence.length - 1 && (
                              <div className="flex items-center px-1 text-[#CBD5E1]">
                                <ArrowRight className="w-4 h-4 text-[#64748B]/60" />
                              </div>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </div>

                    {/* Metrics Row: Verified Distance · Duration · Transfer Time · Safety */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs pt-1 border-t border-[#E6EAF0]/80">
                      <span
                        data-testid={`route-distance-summary-${idx + 1}`}
                        className={`font-mono font-bold text-sm sm:text-[15px] ${
                          hasVerifiedTotalDist
                            ? 'text-[#17243B]'
                            : 'text-amber-800'
                        }`}
                      >
                        {hasVerifiedTotalDist
                          ? `${route.totalDistanceKm} km`
                          : 'Distance incomplete'}
                        {hasVerifiedTotalDist &&
                          route.baselineDistanceKm > 0 &&
                          route.extraDistanceKm > 0 && (
                            <span className="text-xs font-normal text-[#64748B] ml-1">
                              (+{route.extraDistanceKm} km / +{route.extraDistancePct}%)
                            </span>
                          )}
                      </span>

                      <span className="text-[#CBD5E1]" aria-hidden="true">
                        ·
                      </span>

                      <span className="font-mono font-semibold text-[#17243B] inline-flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5 text-[#168A83]" />
                        <span>{formatDuration(route.totalDurationMinutes)} total</span>
                      </span>

                      <span className="text-[#CBD5E1]" aria-hidden="true">
                        ·
                      </span>

                      <span className="font-mono text-[#64748B]">
                        {transferWaitSummary}
                      </span>

                      <span className="text-[#CBD5E1]" aria-hidden="true">
                        ·
                      </span>

                      {renderRiskIndicator(
                        route.overallRiskLevel,
                        route.overallRiskStatus
                      )}
                    </div>

                    {/* Eligible Trains Count per Leg + Journey Details disclosure toggle */}
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#64748B] pt-0.5">
                      <div className="flex flex-wrap items-center gap-1.5 font-mono text-[11px]">
                        <span className="font-semibold text-[#17243B]">
                          Eligible trains:
                        </span>
                        {route.availableTrainsByLeg.map((legOpts, lIdx) => (
                          <span
                            key={lIdx}
                            className="bg-[#F8FAFC] border border-[#E6EAF0] px-2 py-0.5 rounded text-[#64748B]"
                          >
                            Leg {lIdx + 1} ({route.stationSequence[lIdx]}→{route.stationSequence[lIdx + 1]}):{' '}
                            <strong className="text-[#17243B]">{legOpts.length}</strong>
                          </span>
                        ))}
                      </div>

                      <button
                        type="button"
                        data-testid={`toggle-journey-details-btn-${idx + 1}`}
                        onClick={() => toggleRouteDetails(route.routeId)}
                        className="text-xs font-semibold text-[#2447A8] hover:text-[#1D3B8E] inline-flex items-center gap-1 cursor-pointer transition-colors"
                      >
                        {isDetailsOpen ? (
                          <>
                            <ChevronUp className="w-3.5 h-3.5" />
                            <span>Hide Details</span>
                          </>
                        ) : (
                          <>
                            <ChevronDown className="w-3.5 h-3.5" />
                            <span>Distance &amp; Details</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Right Column: Recommendation Score Box & View Train Options CTA */}
                  <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end justify-between gap-3 shrink-0 pt-3 lg:pt-0 border-t lg:border-t-0 border-[#E6EAF0] lg:w-72">
                    <div className="w-full">
                      {renderRecommendationScoreBox(route, idx, true)}
                    </div>

                    <button
                      type="button"
                      data-testid={`view-train-options-btn-${idx + 1}`}
                      onClick={() => {
                        if (onSelectRouteForTrainOptions) {
                          onSelectRouteForTrainOptions(route.routeId);
                        } else {
                          setInternalSelectedRouteId(route.routeId);
                        }
                      }}
                      className="w-full sm:w-auto lg:w-full min-h-[44px] px-4 py-2.5 bg-[#2447A8] hover:bg-[#1D3B8E] text-white text-xs font-semibold rounded-xl shadow-[0_2px_6px_rgba(36,71,168,0.2)] transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <span>View Train Options</span>
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Expandable Journey Details Panel */}
                {isDetailsOpen && renderJourneyDetailsPanel(route, idx)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
