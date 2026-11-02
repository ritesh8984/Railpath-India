/**
 * RailPath India — Core Domain Types & Provider Contracts
 */

export type DayOfWeek = 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';

export type StationCategory = 'JUNCTION' | 'TERMINUS' | 'CENTRAL' | 'CANTT' | 'HALT' | 'REGULAR';

export interface RawStationRecord {
  CODE: string;
  STATION_NAME: string;
  RAILWAY_ZONE: string;
}

export interface NormalizedStation {
  code: string;
  name: string;
  displayName: string;
  zone: string;
  zoneFullName: string;
  category: StationCategory;
  city?: string;
  state?: string;
  hindiName?: string;
  aliases: string[];
  isMajorInterchange: boolean;
  searchTokens: string;
}

export interface StationAuditReport {
  sourcePath: string;
  synchronizedAt: string;
  totalRecords: number;
  uniqueCodes: number;
  duplicateCodes: string[];
  missingCodeCount: number;
  missingNameCount: number;
  missingZoneCount: number;
  sharedStationNamesCount: number;
  zoneDistribution: Record<string, number>;
  categoryDistribution: Record<StationCategory, number>;
  sampleDisambiguatedStations: Array<{
    name: string;
    stations: Array<{ code: string; zone: string; displayName: string }>;
  }>;
  status: 'VALIDATED' | 'HAS_WARNINGS' | 'MISSING_FILE';
  dataMode?: string;
  missingFileHelp?: string;
}

export interface TrainStop {
  stationCode: string;
  stationName: string;
  stopSequence: number;
  arrivalTime: string | null; // "HH:MM" in 24h Asia/Kolkata, null for origin
  departureTime: string | null; // "HH:MM" in 24h Asia/Kolkata, null for destination
  haltMinutes: number;
  dayOffset: number; // 1 for originating day, 2 for next day, etc.
  distanceKm: number; // Cumulative rail distance from train origin
  platform?: string;
}

export interface HistoricalDelayStats {
  trainNumber: string;
  stationCode: string;
  available: boolean;
  sampleCount: number; // e.g., 30 operating trips
  windowDays: number; // e.g., 30 days
  medianDelayMinutes: number;
  p90DelayMinutes: number;
  delayedOver15MinPct: number;
  delayedOver30MinPct: number;
  delayedOver60MinPct: number;
  lastObservedDate: string;
  source: 'HISTORICAL_OBSERVATIONS_30D' | 'UNAVAILABLE';
}

export interface LiveStationEvent {
  stationCode: string;
  stationName: string;
  stopSequence: number;
  dayOffset: number;
  distanceKm: number;
  platform: string;
  scheduledArrival: string | null;
  scheduledDeparture: string | null;
  expectedArrival: string | null;
  expectedDeparture: string | null;
  delayMinutes: number;
  status: 'DEPARTED' | 'ARRIVED' | 'APPROACHING' | 'UPCOMING';
}

export interface LiveTrainStatus {
  trainNumber: string;
  trainName: string;
  trainType: string;
  journeyDate: string;
  currentStationCode: string;
  currentStationName: string;
  nextStationCode: string | null;
  nextStationName: string | null;
  currentDelayMinutes: number;
  runningState: 'RUNNING_ON_TIME' | 'RUNNING_DELAYED' | 'NOT_STARTED' | 'ARRIVED_DESTINATION' | 'CANCELLED' | 'DIVERTED';
  statusNote: string;
  lastUpdatedIso: string;
  dataMode: 'DEMO_SIMULATION' | 'LIVE_API' | 'SCHEDULE_ONLY';
  sourceProvider: string;
  isStale: boolean;
  events: LiveStationEvent[];
}

export interface TrainService {
  trainNumber: string;
  trainName: string;
  trainType: 'SUPERFAST' | 'EXPRESS' | 'MAIL_EXPRESS' | 'RAJDHANI' | 'VANDE_BHARAT' | 'SHATABDI' | 'INTERCITY' | 'GARIB_RATH' | 'SPECIAL';
  operatingDays: DayOfWeek[];
  operatingDaysAvailable?: boolean;
  distanceReliable?: boolean;
  source?: string;
  freshness?: string;
  originCode: string;
  destinationCode: string;
  classes: string[];
  stops: TrainStop[];
  historicalDelaysByStation: Record<string, HistoricalDelayStats>;
  defaultDemoDelayMinutes: number;
  defaultCurrentStationCode: string;
}

export type RailwayDistanceSource =
  | 'VERIFIED_TIMETABLE_CUMULATIVE_KM'
  | 'CORRIDOR_VERIFIED_TIMETABLE_KM'
  | 'MISSING_STOP_DISTANCE_DATA'
  | 'MISSING_LEG_DISTANCE_DATA';

export interface VerifiedDistanceRange {
  minKm: number;
  maxKm: number;
  referenceTrains?: string[];
}

export interface DirectTrainMatch {
  trainNumber: string;
  trainName: string;
  trainType: string;
  operatingDays: DayOfWeek[];
  operatingDaysAvailable?: boolean;
  distanceReliable?: boolean;
  distanceVerified?: boolean;
  distanceSource?: RailwayDistanceSource;
  distanceSourceLabel?: string;
  verifiedDistanceRangeKm?: VerifiedDistanceRange;
  source?: string;
  classes: string[];
  fromStationCode: string;
  fromStationName: string;
  toStationCode: string;
  toStationName: string;
  trainOriginCode: string;
  trainDestinationCode: string;
  boardingDate: string; // YYYY-MM-DD
  arrivalDate: string; // YYYY-MM-DD
  departureTime: string; // HH:MM
  arrivalTime: string; // HH:MM
  durationMinutes: number;
  distanceKm: number;
  intermediateStopsCount: number;
  intermediateStops: TrainStop[];
  allStops: TrainStop[];
  fromPlatform?: string;
  toPlatform?: string;
  historicalReliabilityAtDest: HistoricalDelayStats;
  currentDelayMinutes: number;
  expectedArrivalTime: string;
  dataMode: 'DEMO_SIMULATION' | 'LIVE_API' | 'SCHEDULE_ONLY';
  lastUpdatedIso: string;
  traceableSourceRecord?: {
    dataset: string;
    sourceRecordId?: string;
    trainNumber: string;
    trainName?: string;
    boardingStationCode?: string;
    destinationStationCode?: string;
    originStopSequence: number;
    destinationStopSequence: number;
    orderedStopSequence?: string[];
    scheduledDepartureTime?: string;
    scheduledArrivalTime?: string;
    boardingDate?: string;
    arrivalDate?: string;
    operatingDays?: DayOfWeek[];
    operatingDayVerified?: boolean;
    validationResult?: 'VERIFIED' | 'REJECTED';
  };
}

export type ConnectionRiskStatus =
  | 'Comfortable connection'
  | 'Meets scheduled buffer (delay history unavailable)'
  | 'Connection needs attention'
  | 'High risk of missing the connection'
  | 'Connection likely missed'
  | 'Insufficient live data to assess';

export interface TransferEvaluation {
  interchangeStationCode: string;
  interchangeStationName: string;
  interchangeZone: string;
  samePhysicalStation: boolean;
  interstationTransferNote?: string;
  incomingTrainNumber: string;
  incomingTrainName: string;
  outgoingTrainNumber: string;
  outgoingTrainName: string;
  scheduledArrivalTime: string;
  scheduledArrivalDate: string;
  scheduledDepartureTime: string;
  scheduledDepartureDate: string;
  scheduledLayoverMinutes: number;
  incomingHistoricalStats: HistoricalDelayStats;
  incomingLiveDelayMinutes: number;
  projectedArrivalTime: string;
  effectiveLayoverWithLiveDelayMinutes: number;
  effectiveLayoverWithP50Minutes: number;
  effectiveLayoverWithP90Minutes: number;
  platformTransferMarginMinutes: number;
  userTargetBufferMinutes: number;
  riskStatus: ConnectionRiskStatus;
  riskLevel: 'SAFE' | 'CAUTION' | 'HIGH_RISK' | 'MISSED' | 'UNKNOWN';
  riskReasons: string[];
}

export interface RouteLegOption {
  legIndex: number;
  fromStationCode: string;
  fromStationName: string;
  toStationCode: string;
  toStationName: string;
  trainNumber: string;
  trainName: string;
  trainType: string;
  operatingDays: DayOfWeek[];
  operatingDaysAvailable?: boolean;
  distanceReliable?: boolean;
  distanceVerified?: boolean;
  distanceSource?: RailwayDistanceSource;
  distanceSourceLabel?: string;
  verifiedDistanceRangeKm?: VerifiedDistanceRange;
  source?: string;
  classes: string[];
  boardingDate: string;
  arrivalDate: string;
  departureTime: string;
  arrivalTime: string;
  durationMinutes: number;
  distanceKm: number;
  fromPlatform?: string;
  toPlatform?: string;
  intermediateStopsCount: number;
  stops: TrainStop[];
  historicalDelayAtAlighing: HistoricalDelayStats;
  currentDelayMinutes: number;
  traceableSourceRecord?: {
    dataset: string;
    sourceRecordId?: string;
    trainNumber: string;
    trainName?: string;
    boardingStationCode?: string;
    destinationStationCode?: string;
    originStopSequence: number;
    destinationStopSequence: number;
    orderedStopSequence?: string[];
    scheduledDepartureTime?: string;
    scheduledArrivalTime?: string;
    boardingDate?: string;
    arrivalDate?: string;
    operatingDays?: DayOfWeek[];
    operatingDayVerified?: boolean;
    validationResult?: 'VERIFIED' | 'REJECTED';
  };
}

export type RecommendationBadgeType =
  | 'Recommended'
  | 'Lowest Distance'
  | 'Shortest Journey';

export interface RecommendationScoreBreakdown {
  totalScore: number; // 0 to 100
  scoreAvailable?: boolean;
  scoreStatusMessage?: string;
  scheduleDisclaimer?: string;
  distanceEfficiencyScore: number;
  connectionSafetyScore: number;
  historicalReliabilityScore: number | null; // null if unavailable
  journeyDurationScore: number;
  transferComplexityScore: number;
  weightsUsed: {
    distanceEfficiency: number;
    connectionSafety: number;
    historicalReliability: number;
    journeyDuration: number;
    transferComplexity: number;
  };
  weightsRenormalized: boolean;
  dataConfidence: 'High' | 'Medium (Historical Delay Unavailable)' | 'Low';
  explanations: string[];
}

export type RouteDistanceCategory =
  | 'Low-distance alternatives'
  | 'Recommended alternatives'
  | 'Longer-distance alternatives';

export interface MultiRouteCandidate {
  routeId: string;
  stationSequence: string[]; // e.g., ['ROU', 'RNC', 'BSB']
  stationNamesSequence: string[];
  interchangeStations: Array<{
    code: string;
    name: string;
    zone: string;
  }>;
  numberOfTransfers: number;
  totalDistanceKm: number;
  distanceReliable?: boolean;
  distanceVerified?: boolean;
  distanceSource?: RailwayDistanceSource;
  distanceSourceLabel?: string;
  distanceStatusMessage?: string;
  distanceIncompleteDetail?: string;
  verifiedLegsCount?: number;
  missingLegsCount?: number;
  verifiedDistanceRangeKm?: VerifiedDistanceRange;
  recommendationLabel?: string;
  recommendationBadge?: RecommendationBadgeType;
  baselineDistanceKm: number;
  baselineType: 'DIRECT_TRAIN_BASELINE' | 'SHORTEST_FEASIBLE_PATH_BASELINE';
  extraDistanceKm: number;
  distanceRatioPct: number;
  extraDistancePct: number;
  distanceCategory: RouteDistanceCategory;
  exceedsDefaultDetour: boolean;
  selectedLegs: RouteLegOption[];
  availableTrainsByLeg: RouteLegOption[][];
  transfers: TransferEvaluation[];
  totalDurationMinutes: number;
  overallRiskStatus: ConnectionRiskStatus;
  overallRiskLevel: 'SAFE' | 'CAUTION' | 'HIGH_RISK' | 'MISSED' | 'UNKNOWN';
  recommendation: RecommendationScoreBreakdown;
  dataMode: 'DEMO_SIMULATION' | 'LIVE_API' | 'SCHEDULE_ONLY';
}

export interface RouteDiagnostics {
  status:
    | 'ROUTES_FOUND'
    | 'NO_DIRECT_USE_CONNECTING'
    | 'NO_TRAINS_AT_ORIGIN'
    | 'NO_TRAINS_AT_DESTINATION'
    | 'NO_OPERATING_TRAINS_ON_DATE'
    | 'NO_FEASIBLE_CONNECTIONS_WITHIN_CONSTRAINTS'
    | 'TIMETABLE_DATA_MISSING'
    | 'INVALID_JOURNEY_DATE';
  originTrainsCount: number;
  destinationTrainsCount: number;
  directTrainsAnyDayCount: number;
  directTrainsOnDateCount: number;
  multiRoutesUnfilteredCount: number;
  summary: string;
  reasons: string[];
  timetableSource: string;
  totalTimetableTrains: number;
}

export interface MultiRouteSearchResponse {
  originCode: string;
  originName: string;
  destinationCode: string;
  destinationName: string;
  journeyDate: string;
  targetBufferMinutes: number;
  maxDetourPct: number;
  includeTighterConnections: boolean;
  baselineDistanceKm: number;
  baselineType: 'DIRECT_TRAIN_BASELINE' | 'SHORTEST_FEASIBLE_PATH_BASELINE';
  directTrainsCount: number;
  directTrains?: DirectTrainMatch[];
  routes: MultiRouteCandidate[];
  hiddenLongerRoutesCount: number;
  diagnostics: RouteDiagnostics;
  dataMode: 'DEMO_SIMULATION' | 'LIVE_API' | 'SCHEDULE_ONLY';
  computedAtIso: string;
}

export interface TwoTrainComparisonResult {
  incomingTrain: LiveTrainStatus;
  outgoingTrain: LiveTrainStatus;
  connectingStationCode: string;
  connectingStationName: string;
  commonStations: Array<{ code: string; name: string }>;
  scheduledArrivalTime: string;
  scheduledDepartureTime: string;
  scheduledLayoverMinutes: number;
  incomingDelayMinutes: number;
  outgoingDelayMinutes: number;
  projectedArrivalTime: string;
  projectedDepartureTime: string;
  remainingTransferMinutes: number;
  platformTransferMarginMinutes: number;
  incomingPlatform: string;
  outgoingPlatform: string;
  historicalStatsAtConnection: HistoricalDelayStats;
  comparisonStatus:
    | 'Connection still comfortable'
    | 'Buffer decreasing'
    | 'High risk'
    | 'Likely missed connection'
    | 'Status unavailable or stale';
  riskLevel: 'SAFE' | 'CAUTION' | 'HIGH_RISK' | 'MISSED' | 'UNKNOWN';
  explanation: string;
  lastUpdatedIso: string;
  dataMode: 'DEMO_SIMULATION' | 'LIVE_API' | 'SCHEDULE_ONLY';
}
