import { makeUnavailableDelayStats, TRAIN_SERVICES } from '../data/railwayDataset';
import {
  ConnectionRiskStatus,
  DayOfWeek,
  DirectTrainMatch,
  HistoricalDelayStats,
  LiveStationEvent,
  LiveTrainStatus,
  MultiRouteCandidate,
  MultiRouteSearchResponse,
  NormalizedStation,
  RailwayDistanceSource,
  RecommendationBadgeType,
  RecommendationScoreBreakdown,
  RouteDiagnostics,
  RouteDistanceCategory,
  RouteLegOption,
  TrainService,
  TrainStop,
  TransferEvaluation,
  TwoTrainComparisonResult,
  VerifiedDistanceRange,
} from '../types/railway';

const DAYS_OF_WEEK: DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/**
 * Indexed Nationwide Route Graph built from imported TrainService stop sequences.
 * Only indexes genuine commercial passenger halts (origin, final destination, or arrival !== departure).
 */
export interface StationTrainStopEntry {
  train: TrainService;
  stopIdx: number;
  stop: TrainStop;
}

export interface CorridorTerminalEntry {
  dist: number;
  trainNumber: string;
  seq: string[];
  isDirectTerminal: boolean;
}

export interface CorridorDistanceMatch {
  distanceKm: number;
  minKm: number;
  maxKm: number;
  hops: number;
  referenceTrains: string[];
}

export interface RailwayRouteGraph {
  trainsAtStation: Map<string, StationTrainStopEntry[]>;
  stopIdxByStationAndTrain: Map<string, Map<string, number>>;
  stopIndicesByStationAndTrain: Map<string, Map<string, number[]>>;
  trainByNumber: Map<string, TrainService>;
  corridorTerminalMap: Map<string, CorridorTerminalEntry[]>;
  corridorSegmentCache: Map<string, CorridorDistanceMatch | null>;
  corridorBridgeMap: Map<string, Set<string>>;
}

const graphCache = new WeakMap<TrainService[], RailwayRouteGraph>();
const datasetByTrain = new WeakMap<TrainService, TrainService[]>();

function sameCorridorStopOrder(seqA: string[], seqB: string[]): boolean {
  if (seqA.length < 2 || seqB.length < 2) return false;
  if (seqA[0] !== seqB[0] || seqA[seqA.length - 1] !== seqB[seqB.length - 1]) {
    return false;
  }
  const interA = seqA.slice(1, -1);
  const interB = seqB.slice(1, -1);
  if (interA.length === 0 || interB.length === 0) return false;
  const setB = new Set(interB);
  const sharedCount = interA.filter((c) => setB.has(c)).length;
  const minLen = Math.min(interA.length, interB.length);
  return sharedCount >= Math.max(1, Math.ceil(minLen * 0.75));
}

function matchCorridorSubSegment(
  corridorTerminalMap: Map<string, CorridorTerminalEntry[]>,
  u: string,
  v: string,
  segCodes: string[]
): { km: number; minKm: number; maxKm: number; refTrain: string } | null {
  const list = corridorTerminalMap.get(`${u}->${v}`);
  if (!list || list.length === 0) return null;
  const segInter = new Set(segCodes.slice(1, -1));
  const compatible = list.filter((entry) => {
    if (segInter.size === 0 || entry.seq.length <= 2) {
      return entry.isDirectTerminal;
    }
    return entry.seq.slice(1, -1).some((c) => segInter.has(c));
  });
  if (compatible.length === 0) return null;
  const directOnly = compatible.filter((c) => c.isDirectTerminal);
  const pool = directOnly.length > 0 ? directOnly : compatible;
  const dists = pool.map((c) => c.dist).sort((a, b) => a - b);
  const minKm = dists[0];
  const maxKm = dists[dists.length - 1];
  if (maxKm - minKm > 12) return null;
  return {
    km: minKm,
    minKm,
    maxKm,
    refTrain: pool[0].trainNumber,
  };
}

export function resolveSegmentByCorridorIndex(
  graph: RailwayRouteGraph,
  stopCodes: string[]
): CorridorDistanceMatch | null {
  if (stopCodes.length < 2) return null;
  const cacheKey = stopCodes.join('>');
  if (graph.corridorSegmentCache.has(cacheKey)) {
    return graph.corridorSegmentCache.get(cacheKey) || null;
  }

  const n = stopCodes.length;
  const dp: Array<CorridorDistanceMatch | null> = new Array(n).fill(null);
  dp[0] = {
    distanceKm: 0,
    minKm: 0,
    maxKm: 0,
    hops: 0,
    referenceTrains: [],
  };

  for (let i = 0; i < n - 1; i++) {
    const cur = dp[i];
    if (!cur) continue;
    for (let j = n - 1; j > i; j--) {
      const m = matchCorridorSubSegment(
        graph.corridorTerminalMap,
        stopCodes[i],
        stopCodes[j],
        stopCodes.slice(i, j + 1)
      );
      if (m) {
        const cand: CorridorDistanceMatch = {
          distanceKm: Number((cur.distanceKm + m.km).toFixed(2)),
          minKm: Number((cur.minKm + m.minKm).toFixed(2)),
          maxKm: Number((cur.maxKm + m.maxKm).toFixed(2)),
          hops: cur.hops + 1,
          referenceTrains: [
            ...cur.referenceTrains,
            `${stopCodes[i]}→${stopCodes[j]} (${m.refTrain}: ${m.km} km)`,
          ],
        };
        const existing = dp[j];
        if (
          !existing ||
          cand.hops < existing.hops ||
          (cand.hops === existing.hops && cand.distanceKm < existing.distanceKm)
        ) {
          dp[j] = cand;
        }
      }
    }
  }

  const resolved = dp[n - 1];
  graph.corridorSegmentCache.set(cacheKey, resolved);
  return resolved;
}

/**
 * Checks whether a TrainStop at index idx in train.stops is a valid commercial passenger stop.
 * Intermediate stops with 0-minute halt (arrivalTime === departureTime) are non-stop passing rows
 * and must never be used for boarding, alighting, or transferring.
 */
export function isCommercialTrainStop(train: TrainService, idx: number): boolean {
  if (idx < 0 || idx >= train.stops.length) return false;
  const stop = train.stops[idx];
  if (idx === 0) {
    return Boolean(stop.departureTime);
  }
  if (idx === train.stops.length - 1) {
    return Boolean(stop.arrivalTime);
  }
  return Boolean(
    stop.arrivalTime &&
      stop.departureTime &&
      stop.arrivalTime !== stop.departureTime &&
      stop.haltMinutes > 0
  );
}

export function getRouteGraph(trains: TrainService[]): RailwayRouteGraph {
  const cached = graphCache.get(trains);
  if (cached) return cached;

  const trainsAtStation = new Map<string, StationTrainStopEntry[]>();
  const stopIdxByStationAndTrain = new Map<string, Map<string, number>>();
  const stopIndicesByStationAndTrain = new Map<string, Map<string, number[]>>();
  const trainByNumber = new Map<string, TrainService>();
  const corridorTerminalMap = new Map<string, CorridorTerminalEntry[]>();
  const corridorBridgeMap = new Map<string, Set<string>>();

  const addCorridorBridge = (u: string, v: string, mid: string) => {
    if (!u || !v || !mid || u === v || u === mid || v === mid) return;
    for (const key of [`${u}->${v}`, `${v}->${u}`]) {
      let set = corridorBridgeMap.get(key);
      if (!set) {
        set = new Set<string>();
        corridorBridgeMap.set(key, set);
      }
      set.add(mid);
    }
  };

  // Register the Shoranur triangular junction physical bridge between the Palakkad branch
  // (CBE, PGT, OTP) and the Thrissur branch (WKI, TCR, AWY, ERS, ERN) so through trains
  // taking the Shoranur B-Cabin bypass chord are recognized as physically traversing past SRR.
  for (const palStop of ['CBE', 'PGT', 'OTP']) {
    for (const tcrStop of ['WKI', 'TCR', 'AWY', 'ERS', 'ERN']) {
      addCorridorBridge(palStop, tcrStop, 'SRR');
    }
  }
  // Register Western Railway trunk bridge (BRC <-> BSR bridging ST and BH for non-stop Rajdhani services)
  addCorridorBridge('BRC', 'BSR', 'ST');
  addCorridorBridge('BRC', 'BSR', 'BH');

  for (const train of trains) {
    if (!train.trainNumber || !Array.isArray(train.stops) || train.stops.length < 2) {
      continue;
    }
    datasetByTrain.set(train, trains);
    trainByNumber.set(train.trainNumber, train);
    for (let idx = 0; idx < train.stops.length; idx++) {
      if (!isCommercialTrainStop(train, idx)) continue;
      const stop = train.stops[idx];
      const code = stop.stationCode.trim().toUpperCase();
      if (!code) continue;

      let list = trainsAtStation.get(code);
      if (!list) {
        list = [];
        trainsAtStation.set(code, list);
      }
      list.push({ train, stopIdx: idx, stop });

      let byTrain = stopIdxByStationAndTrain.get(code);
      if (!byTrain) {
        byTrain = new Map<string, number>();
        stopIdxByStationAndTrain.set(code, byTrain);
      }
      if (!byTrain.has(train.trainNumber)) {
        byTrain.set(train.trainNumber, idx);
      }

      let multiByTrain = stopIndicesByStationAndTrain.get(code);
      if (!multiByTrain) {
        multiByTrain = new Map<string, number[]>();
        stopIndicesByStationAndTrain.set(code, multiByTrain);
      }
      let idxArr = multiByTrain.get(train.trainNumber);
      if (!idxArr) {
        idxArr = [];
        multiByTrain.set(train.trainNumber, idxArr);
      }
      idxArr.push(idx);
    }

    // Index verified origin-to-destination terminal railway distances
    const firstStop = train.stops[0];
    const lastStop = train.stops[train.stops.length - 1];
    if (
      typeof firstStop.distanceKm === 'number' &&
      typeof lastStop.distanceKm === 'number' &&
      firstStop.distanceKm >= 0 &&
      lastStop.distanceKm > firstStop.distanceKm
    ) {
      const totalKm = Number((lastStop.distanceKm - firstStop.distanceKm).toFixed(2));
      const codes = train.stops.map((s) => s.stationCode.trim().toUpperCase());
      const orig = codes[0];
      const dest = codes[codes.length - 1];
      if (orig && dest && orig !== dest && totalKm > 0) {
        for (const [u, v, seq] of [
          [orig, dest, codes],
          [dest, orig, [...codes].reverse()],
        ] as Array<[string, string, string[]]>) {
          const key = `${u}->${v}`;
          let arr = corridorTerminalMap.get(key);
          if (!arr) {
            arr = [];
            corridorTerminalMap.set(key, arr);
          }
          arr.push({
            dist: totalKm,
            trainNumber: train.trainNumber,
            seq,
            isDirectTerminal: true,
          });
        }
      }
    }
  }

  // Single-pass strict same-corridor prefix/suffix subtraction for trains with verified endpoint distance
  for (const train of trains) {
    if (!Array.isArray(train.stops) || train.stops.length < 4) continue;
    const firstStop = train.stops[0];
    const lastStop = train.stops[train.stops.length - 1];
    if (
      typeof firstStop.distanceKm !== 'number' ||
      typeof lastStop.distanceKm !== 'number' ||
      firstStop.distanceKm < 0 ||
      lastStop.distanceKm <= firstStop.distanceKm
    ) {
      continue;
    }
    const totalKm = Number((lastStop.distanceKm - firstStop.distanceKm).toFixed(2));
    const codes = train.stops.map((s) => s.stationCode.trim().toUpperCase());
    const s0 = codes[0];
    const sk = codes[codes.length - 1];

    for (let i = 1; i < codes.length - 1; i++) {
      const si = codes[i];
      const prefSeq = codes.slice(0, i + 1);
      const sufSeq = codes.slice(i);

      const prefMatches = (corridorTerminalMap.get(`${s0}->${si}`) || []).filter(
        (e) => e.isDirectTerminal && sameCorridorStopOrder(prefSeq, e.seq)
      );
      if (prefMatches.length > 0) {
        const dists = prefMatches.map((x) => x.dist);
        if (Math.max(...dists) - Math.min(...dists) <= 3) {
          const rem = Number((totalKm - dists[0]).toFixed(2));
          if (rem > 10) {
            for (const [u, v, seq] of [
              [si, sk, sufSeq],
              [sk, si, [...sufSeq].reverse()],
            ] as Array<[string, string, string[]]>) {
              const key = `${u}->${v}`;
              let arr = corridorTerminalMap.get(key);
              if (!arr) {
                arr = [];
                corridorTerminalMap.set(key, arr);
              }
              arr.push({
                dist: rem,
                trainNumber: `${train.trainNumber}/${prefMatches[0].trainNumber}`,
                seq,
                isDirectTerminal: false,
              });
            }
          }
        }
      }

      const sufMatches = (corridorTerminalMap.get(`${si}->${sk}`) || []).filter(
        (e) => e.isDirectTerminal && sameCorridorStopOrder(sufSeq, e.seq)
      );
      if (sufMatches.length > 0) {
        const dists = sufMatches.map((x) => x.dist);
        if (Math.max(...dists) - Math.min(...dists) <= 3) {
          const rem = Number((totalKm - dists[0]).toFixed(2));
          if (rem > 10) {
            for (const [u, v, seq] of [
              [s0, si, prefSeq],
              [si, s0, [...prefSeq].reverse()],
            ] as Array<[string, string, string[]]>) {
              const key = `${u}->${v}`;
              let arr = corridorTerminalMap.get(key);
              if (!arr) {
                arr = [];
                corridorTerminalMap.set(key, arr);
              }
              arr.push({
                dist: rem,
                trainNumber: `${train.trainNumber}/${sufMatches[0].trainNumber}`,
                seq,
                isDirectTerminal: false,
              });
            }
          }
        }
      }
    }
  }

  const graph: RailwayRouteGraph = {
    trainsAtStation,
    stopIdxByStationAndTrain,
    stopIndicesByStationAndTrain,
    trainByNumber,
    corridorTerminalMap,
    corridorSegmentCache: new Map<string, CorridorDistanceMatch | null>(),
    corridorBridgeMap,
  };
  graphCache.set(trains, graph);
  return graph;
}

/**
 * Parse "HH:MM" into minutes from 00:00 (0..1439)
 */
export function parseTimeToMinutes(hhmm: string | null | undefined): number {
  if (!hhmm) return 0;
  const parts = hhmm.trim().split(':');
  if (parts.length < 2) return 0;
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Format minutes (may exceed 1440) back into "HH:MM"
 */
export function formatMinutesToTime(totalMinutes: number): string {
  const normalized = ((Math.round(totalMinutes) % 1440) + 1440) % 1440;
  const h = Math.floor(normalized / 60);
  const m = normalized % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Format duration in minutes as "Xh Ym"
 */
export function formatDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(minutes));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/**
 * Strictly validate that a date string is a real calendar date in YYYY-MM-DD format
 * (rejects non-dates, out-of-range months/days, and impossible calendar dates like 2026-02-30).
 */
export function isValidJourneyDate(dateStr: string | null | undefined): boolean {
  if (!dateStr || typeof dateStr !== 'string') return false;
  const trimmed = dateStr.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const [y, m, d] = trimmed.split('-').map((v) => parseInt(v, 10));
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  );
}

/**
 * Add calendar days to a YYYY-MM-DD date string (UTC-safe calendar arithmetic)
 */
export function addDaysToDateString(dateStr: string, daysToAdd: number): string {
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + daysToAdd));
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(dt.getUTCDate()).padStart(2, '0');
  return `${yy}-${mm}-${dd}`;
}

/**
 * Difference in calendar days (dateB - dateA)
 */
export function diffDaysBetweenDates(dateA: string, dateB: string): number {
  const [yA, mA, dA] = dateA.split('-').map((v) => parseInt(v, 10));
  const [yB, mB, dB] = dateB.split('-').map((v) => parseInt(v, 10));
  const utcA = Date.UTC(yA, (mA || 1) - 1, dA || 1);
  const utcB = Date.UTC(yB, (mB || 1) - 1, dB || 1);
  return Math.round((utcB - utcA) / (1000 * 60 * 60 * 24));
}

/**
 * Get DayOfWeek ('Mon'..'Sun') for a YYYY-MM-DD date string
 */
export function getDayOfWeekForDate(dateStr: string): DayOfWeek {
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
  return DAYS_OF_WEEK[dt.getUTCDay()];
}

/**
 * Check if a train service operates at a given stop on the passenger's boarding calendar date.
 * Rejects invalid calendar dates and empty operating-day arrays.
 * Enforces operatingDays whenever available in the dataset; if operatingDaysAvailable is false
 * (as in raw DataMeet CC0 schedules), treats the service as eligible on the requested valid date.
 */
export function doesTrainOperateAtStopOnDate(
  train: TrainService,
  stop: TrainStop,
  boardingDateStr: string
): boolean {
  if (!isValidJourneyDate(boardingDateStr)) {
    return false;
  }
  if (!Array.isArray(train.operatingDays) || train.operatingDays.length === 0) {
    return false;
  }
  if (train.operatingDaysAvailable === false) {
    return true;
  }
  const originOffsetDays = -(Math.max(1, stop.dayOffset) - 1);
  const trainOriginDateStr = addDaysToDateString(boardingDateStr, originOffsetDays);
  const originDow = getDayOfWeekForDate(trainOriginDateStr);
  return train.operatingDays.includes(originDow);
}

/**
 * Compute travel duration in minutes between two stops of the same train,
 * accounting accurately for midnight crossings and multi-day offsets.
 */
export function calculateLegDurationMinutes(fromStop: TrainStop, toStop: TrainStop): number {
  const depMin = parseTimeToMinutes(fromStop.departureTime);
  const arrMin = parseTimeToMinutes(toStop.arrivalTime);
  const dayDiff = Math.max(0, toStop.dayOffset - fromStop.dayOffset);
  const raw = dayDiff * 1440 + (arrMin - depMin);
  if (raw > 0) return raw;
  return raw + 1440;
}

/**
 * Retrieve historical delay statistics for a train at a station, or an honest UNAVAILABLE record.
 */
export function getHistoricalDelayForTrainAtStation(
  train: TrainService,
  stationCode: string
): HistoricalDelayStats {
  const code = stationCode.trim().toUpperCase();
  const stats = train.historicalDelaysByStation?.[code];
  if (stats && stats.available) {
    return stats;
  }
  return makeUnavailableDelayStats(train.trainNumber, code);
}

export const MISSING_TOTAL_DISTANCE_MESSAGE =
  'Total distance unavailable — distance data missing for one or more legs';

/**
 * Phase 2: Three-tier verified railway distance calculation for a train leg:
 * - Priority A (VERIFIED_TIMETABLE_CUMULATIVE_KM):
 *   Destination cumulative km - Origin cumulative km from the same train's ordered stop sequence.
 * - Priority B (CORRIDOR_VERIFIED_TIMETABLE_KM):
 *   When intermediate stop cumulative km is null in DataMeet CC0, resolves the exact rail corridor
 *   distance from verified terminal-to-terminal timetable trains along the same ordered stop segment.
 * - Priority C (MISSING_STOP_DISTANCE_DATA):
 *   If neither Priority A nor Priority B provides a verified distance, marks distance unavailable (0).
 *   Never uses Haversine straight-line distance or interpolates distances.
 */
export function calculateVerifiedLegDistance(
  train: TrainService,
  fromStop: TrainStop,
  toStop: TrainStop,
  fromIdx?: number,
  toIdx?: number,
  trains?: TrainService[]
): {
  distanceKm: number;
  distanceReliable: boolean;
  distanceVerified: boolean;
  distanceSource: RailwayDistanceSource;
  distanceSourceLabel: string;
  verifiedDistanceRangeKm?: VerifiedDistanceRange;
} {
  const uFrom = fromStop.stationCode.trim().toUpperCase();
  const uTo = toStop.stationCode.trim().toUpperCase();

  let actualFromIdx = fromIdx !== undefined ? fromIdx : -1;
  let actualToIdx = toIdx !== undefined ? toIdx : -1;

  // Support repeated station codes (circular/loop routes) by matching stopSequence first, then ordered pairs (fromIdx < toIdx)
  if (actualFromIdx < 0 && fromStop.stopSequence >= 1 && fromStop.stopSequence <= train.stops.length) {
    const cand = train.stops[fromStop.stopSequence - 1];
    if (cand && cand.stationCode.trim().toUpperCase() === uFrom) {
      actualFromIdx = fromStop.stopSequence - 1;
    }
  }
  if (actualToIdx < 0 && toStop.stopSequence >= 1 && toStop.stopSequence <= train.stops.length) {
    const cand = train.stops[toStop.stopSequence - 1];
    if (cand && cand.stationCode.trim().toUpperCase() === uTo) {
      actualToIdx = toStop.stopSequence - 1;
    }
  }

  if (actualFromIdx < 0 || actualToIdx < 0 || actualFromIdx >= actualToIdx) {
    let resolvedFrom = -1;
    let resolvedTo = -1;
    for (let i = 0; i < train.stops.length; i++) {
      if (train.stops[i].stationCode.trim().toUpperCase() !== uFrom) continue;
      for (let j = i + 1; j < train.stops.length; j++) {
        if (train.stops[j].stationCode.trim().toUpperCase() === uTo) {
          resolvedFrom = i;
          resolvedTo = j;
          break;
        }
      }
      if (resolvedFrom >= 0) break;
    }
    if (actualFromIdx < 0) actualFromIdx = resolvedFrom;
    if (actualToIdx < 0 || actualToIdx <= actualFromIdx) actualToIdx = resolvedTo;
  }

  if (
    actualFromIdx < 0 ||
    actualToIdx < 0 ||
    actualFromIdx >= actualToIdx ||
    actualToIdx >= train.stops.length
  ) {
    return {
      distanceKm: 0,
      distanceReliable: false,
      distanceVerified: false,
      distanceSource: 'MISSING_STOP_DISTANCE_DATA',
      distanceSourceLabel: 'Distance data unavailable in timetable dataset',
    };
  }

  const seqFrom = train.stops[actualFromIdx];
  const seqTo = train.stops[actualToIdx];
  if (
    seqFrom.stationCode.trim().toUpperCase() !== uFrom ||
    seqTo.stationCode.trim().toUpperCase() !== uTo ||
    seqFrom.stopSequence >= seqTo.stopSequence
  ) {
    return {
      distanceKm: 0,
      distanceReliable: false,
      distanceVerified: false,
      distanceSource: 'MISSING_STOP_DISTANCE_DATA',
      distanceSourceLabel: 'Distance data unavailable in timetable dataset',
    };
  }

  // Check if any recorded cumulative stop distances in the segment [actualFromIdx..actualToIdx] are non-monotonic.
  // If non-monotonic values exist on the train's stops, quarantine immediately and do NOT fallback.
  let segmentHasNonMonotonicKm = false;
  let lastRecordedKm = -1;
  for (let i = actualFromIdx; i <= actualToIdx; i++) {
    const stopKm = train.stops[i].distanceKm;
    if (typeof stopKm === 'number' && Number.isFinite(stopKm) && stopKm >= 0) {
      if (lastRecordedKm >= 0 && stopKm <= lastRecordedKm) {
        segmentHasNonMonotonicKm = true;
        break;
      }
      lastRecordedKm = stopKm;
    }
  }

  if (segmentHasNonMonotonicKm) {
    return {
      distanceKm: 0,
      distanceReliable: false,
      distanceVerified: false,
      distanceSource: 'MISSING_STOP_DISTANCE_DATA',
      distanceSourceLabel: 'Non-monotonic stop distance values quarantined',
    };
  }

  const fKm = seqFrom.distanceKm;
  const tKm = seqTo.distanceKm;

  // PRIORITY A: Cumulative per-stop railway kilometre values on this train's stop sequence
  if (
    typeof fKm === 'number' &&
    typeof tKm === 'number' &&
    Number.isFinite(fKm) &&
    Number.isFinite(tKm) &&
    fKm >= 0 &&
    tKm > fKm
  ) {
    const distanceKm = Number((tKm - fKm).toFixed(2));
    if (distanceKm > 0) {
      return {
        distanceKm,
        distanceReliable: true,
        distanceVerified: true,
        distanceSource: 'VERIFIED_TIMETABLE_CUMULATIVE_KM',
        distanceSourceLabel: `Verified train cumulative stop distance (${tKm} km − ${fKm} km)`,
        verifiedDistanceRangeKm: {
          minKm: distanceKm,
          maxKm: distanceKm,
          referenceTrains: [train.trainNumber],
        },
      };
    }
  }

  // PRIORITY B: Authoritative station-to-station rail corridor distance from verified timetable trains
  const resolvedTrains = trains || datasetByTrain.get(train);
  if (resolvedTrains && resolvedTrains.length > 0) {
    const graph = getRouteGraph(resolvedTrains);
    const segmentCodes = train.stops
      .slice(actualFromIdx, actualToIdx + 1)
      .map((s) => s.stationCode.trim().toUpperCase());
    const corridorMatch = resolveSegmentByCorridorIndex(graph, segmentCodes);
    if (corridorMatch && corridorMatch.distanceKm > 0) {
      return {
        distanceKm: corridorMatch.distanceKm,
        distanceReliable: true,
        distanceVerified: true,
        distanceSource: 'CORRIDOR_VERIFIED_TIMETABLE_KM',
        distanceSourceLabel: `Verified rail corridor timetable distance (${corridorMatch.referenceTrains.join(' + ')})`,
        verifiedDistanceRangeKm: {
          minKm: corridorMatch.minKm,
          maxKm: corridorMatch.maxKm,
          referenceTrains: corridorMatch.referenceTrains,
        },
      };
    }
  }

  // PRIORITY C: Distance unavailable
  return {
    distanceKm: 0,
    distanceReliable: false,
    distanceVerified: false,
    distanceSource: 'MISSING_STOP_DISTANCE_DATA',
    distanceSourceLabel: 'Distance data unavailable in timetable dataset',
  };
}

/**
 * Phase 2: Calculate a route's total railway distance by summing verified distances of its selected legs.
 * If one or more required leg distances are missing, returns totalDistanceKm = 0, distanceReliable = false,
 * and honest status messages without displaying a falsely complete total.
 */
export function calculateVerifiedRouteDistance(
  legs: Array<
    Pick<RouteLegOption, 'distanceKm' | 'distanceReliable'> &
      Partial<
        Pick<
          RouteLegOption,
          'distanceSource' | 'distanceSourceLabel' | 'verifiedDistanceRangeKm'
        >
      >
  >
): {
  totalDistanceKm: number;
  distanceReliable: boolean;
  distanceVerified: boolean;
  distanceSource: RailwayDistanceSource;
  distanceSourceLabel: string;
  distanceStatusMessage: string;
  distanceIncompleteDetail?: string;
  verifiedLegsCount: number;
  missingLegsCount: number;
  verifiedDistanceRangeKm?: VerifiedDistanceRange;
} {
  if (!Array.isArray(legs) || legs.length === 0) {
    return {
      totalDistanceKm: 0,
      distanceReliable: false,
      distanceVerified: false,
      distanceSource: 'MISSING_LEG_DISTANCE_DATA',
      distanceSourceLabel: 'Distance data unavailable',
      distanceStatusMessage: MISSING_TOTAL_DISTANCE_MESSAGE,
      distanceIncompleteDetail:
        'Distance incomplete — distance data unavailable for one or more legs.',
      verifiedLegsCount: 0,
      missingLegsCount: 0,
    };
  }

  const verifiedLegs = legs.filter(
    (l) =>
      l.distanceReliable !== false &&
      typeof l.distanceKm === 'number' &&
      Number.isFinite(l.distanceKm) &&
      l.distanceKm > 0
  );
  const verifiedLegsCount = verifiedLegs.length;
  const missingLegsCount = Math.max(0, legs.length - verifiedLegsCount);

  if (missingLegsCount > 0) {
    const distanceIncompleteDetail =
      missingLegsCount === 1
        ? 'Distance incomplete — distance data unavailable for one leg.'
        : `Distance incomplete — distance data unavailable for ${missingLegsCount} legs.`;
    return {
      totalDistanceKm: 0,
      distanceReliable: false,
      distanceVerified: false,
      distanceSource: 'MISSING_LEG_DISTANCE_DATA',
      distanceSourceLabel: distanceIncompleteDetail,
      distanceStatusMessage: MISSING_TOTAL_DISTANCE_MESSAGE,
      distanceIncompleteDetail,
      verifiedLegsCount,
      missingLegsCount,
    };
  }

  const totalDistanceKm = Number(
    legs.reduce((sum, l) => sum + l.distanceKm, 0).toFixed(2)
  );
  const allCumulative = legs.every(
    (l) =>
      !l.distanceSource ||
      l.distanceSource === 'VERIFIED_TIMETABLE_CUMULATIVE_KM'
  );
  const minKm = Number(
    legs
      .reduce(
        (sum, l) => sum + (l.verifiedDistanceRangeKm?.minKm ?? l.distanceKm),
        0
      )
      .toFixed(2)
  );
  const maxKm = Number(
    legs
      .reduce(
        (sum, l) => sum + (l.verifiedDistanceRangeKm?.maxKm ?? l.distanceKm),
        0
      )
      .toFixed(2)
  );

  return {
    totalDistanceKm,
    distanceReliable: true,
    distanceVerified: true,
    distanceSource: allCumulative
      ? 'VERIFIED_TIMETABLE_CUMULATIVE_KM'
      : 'CORRIDOR_VERIFIED_TIMETABLE_KM',
    distanceSourceLabel: allCumulative
      ? 'Verified from train cumulative stop distances'
      : 'Verified from train cumulative & rail corridor timetable distances',
    distanceStatusMessage: `${totalDistanceKm} km verified railway distance`,
    verifiedLegsCount: legs.length,
    missingLegsCount: 0,
    verifiedDistanceRangeKm: {
      minKm,
      maxKm,
    },
  };
}

export interface LegValidationAuditResult {
  valid: boolean;
  reason?: string;
}

/**
 * Checks whether a candidate train leg is a coupled `-Slip` / link coach duplicate of an
 * already-selected main train on the exact same station pair, boarding date, and schedule slot.
 */
function isRedundantCoupledSlipDuplicate<
  T extends {
    trainNumber: string;
    fromStationCode: string;
    toStationCode: string;
    boardingDate: string;
    departureTime: string;
    arrivalTime: string;
  }
>(candidate: T, existingList: T[]): boolean {
  const isCandidateSlip = /(?:-slip|slip)$/i.test(candidate.trainNumber);
  const candBase = candidate.trainNumber.replace(/(?:-slip|slip)$/i, '');
  for (const existing of existingList) {
    if (
      existing.fromStationCode.toUpperCase() === candidate.fromStationCode.toUpperCase() &&
      existing.toStationCode.toUpperCase() === candidate.toStationCode.toUpperCase() &&
      existing.boardingDate === candidate.boardingDate &&
      existing.departureTime === candidate.departureTime &&
      existing.arrivalTime === candidate.arrivalTime
    ) {
      const existingBase = existing.trainNumber.replace(/(?:-slip|slip)$/i, '');
      if (isCandidateSlip || existingBase === candBase) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Requirement 2 & 3: Detailed train-leg verification with structured diagnostic reason.
 */
export function validateTrainLegWithReason(
  leg: Pick<
    RouteLegOption,
    | 'trainNumber'
    | 'trainName'
    | 'fromStationCode'
    | 'toStationCode'
    | 'departureTime'
    | 'arrivalTime'
    | 'boardingDate'
    | 'arrivalDate'
    | 'durationMinutes'
    | 'distanceKm'
    | 'distanceReliable'
    | 'traceableSourceRecord'
  >,
  trains: TrainService[]
): LegValidationAuditResult {
  const graph = getRouteGraph(trains);
  const train = graph.trainByNumber.get(leg.trainNumber);
  if (!train) {
    return { valid: false, reason: `Train ${leg.trainNumber} not found in imported timetable.` };
  }
  if (train.trainName !== leg.trainName) {
    return {
      valid: false,
      reason: `Train ${leg.trainNumber} name mismatch ("${leg.trainName}" vs "${train.trainName}").`,
    };
  }

  const uFrom = leg.fromStationCode.trim().toUpperCase();
  const uTo = leg.toStationCode.trim().toUpperCase();
  if (!uFrom || !uTo || uFrom === uTo) {
    return { valid: false, reason: `Invalid origin/destination station codes (${uFrom} -> ${uTo}).` };
  }

  let fromIdx = -1;
  let toIdx = -1;
  if (
    leg.traceableSourceRecord &&
    leg.traceableSourceRecord.originStopSequence >= 1 &&
    leg.traceableSourceRecord.destinationStopSequence >
      leg.traceableSourceRecord.originStopSequence &&
    leg.traceableSourceRecord.destinationStopSequence <= train.stops.length
  ) {
    const candFromIdx = leg.traceableSourceRecord.originStopSequence - 1;
    const candToIdx = leg.traceableSourceRecord.destinationStopSequence - 1;
    if (
      train.stops[candFromIdx]?.stationCode.toUpperCase() === uFrom &&
      train.stops[candToIdx]?.stationCode.toUpperCase() === uTo
    ) {
      fromIdx = candFromIdx;
      toIdx = candToIdx;
    }
  }

  if (fromIdx < 0 || toIdx < 0) {
    fromIdx = train.stops.findIndex((s) => s.stationCode.toUpperCase() === uFrom);
    toIdx = train.stops.findIndex(
      (s, idx) => idx > fromIdx && s.stationCode.toUpperCase() === uTo
    );
  }
  if (fromIdx < 0 || toIdx < 0 || fromIdx >= toIdx) {
    return {
      valid: false,
      reason: `Train ${leg.trainNumber} does not serve ${uFrom} -> ${uTo} in ascending stop order.`,
    };
  }

  if (!isCommercialTrainStop(train, fromIdx) || !isCommercialTrainStop(train, toIdx)) {
    return {
      valid: false,
      reason: `Train ${leg.trainNumber} does not have an eligible commercial passenger halt at ${uFrom} or ${uTo}.`,
    };
  }

  const fromStop = train.stops[fromIdx];
  const toStop = train.stops[toIdx];

  if (!fromStop.departureTime || !toStop.arrivalTime) {
    return { valid: false, reason: `Missing departure/arrival time on ${leg.trainNumber}.` };
  }
  if (fromStop.departureTime !== leg.departureTime) {
    return { valid: false, reason: `Departure time mismatch at ${uFrom} on ${leg.trainNumber}.` };
  }
  if (toStop.arrivalTime !== leg.arrivalTime) {
    return { valid: false, reason: `Arrival time mismatch at ${uTo} on ${leg.trainNumber}.` };
  }

  if (!isValidJourneyDate(leg.boardingDate) || !isValidJourneyDate(leg.arrivalDate)) {
    return { valid: false, reason: `Invalid boarding or arrival calendar date on ${leg.trainNumber}.` };
  }
  if (!doesTrainOperateAtStopOnDate(train, fromStop, leg.boardingDate)) {
    return {
      valid: false,
      reason: `Train ${leg.trainNumber} does not operate at ${uFrom} on ${leg.boardingDate}.`,
    };
  }

  const expectedDayDelta = Math.max(0, toStop.dayOffset - fromStop.dayOffset);
  const expectedArrivalDate = addDaysToDateString(leg.boardingDate, expectedDayDelta);
  if (leg.arrivalDate !== expectedArrivalDate) {
    return { valid: false, reason: `Arrival date mismatch on ${leg.trainNumber}.` };
  }

  const expectedDuration = calculateLegDurationMinutes(fromStop, toStop);
  if (expectedDuration <= 0 || leg.durationMinutes !== expectedDuration) {
    return { valid: false, reason: `Duration mismatch on ${leg.trainNumber}.` };
  }

  const verifiedDist = calculateVerifiedLegDistance(
    train,
    fromStop,
    toStop,
    fromIdx,
    toIdx,
    trains
  );
  if (leg.distanceReliable) {
    if (!verifiedDist.distanceReliable) {
      return { valid: false, reason: `Unverified distance marked reliable on ${leg.trainNumber}.` };
    }
    if (leg.distanceKm !== verifiedDist.distanceKm) {
      return { valid: false, reason: `Distance km mismatch on ${leg.trainNumber}.` };
    }
  } else {
    if (leg.distanceKm !== 0) {
      return { valid: false, reason: `Unreliable distance must have distanceKm === 0.` };
    }
  }

  if (
    !leg.traceableSourceRecord ||
    leg.traceableSourceRecord.trainNumber !== train.trainNumber ||
    leg.traceableSourceRecord.originStopSequence !== fromStop.stopSequence ||
    leg.traceableSourceRecord.destinationStopSequence !== toStop.stopSequence
  ) {
    return { valid: false, reason: `Missing or mismatched traceableSourceRecord on ${leg.trainNumber}.` };
  }

  return { valid: true };
}

/**
 * Requirement 2: Strictly verify a candidate train leg against the actual imported timetable.
 */
export function verifyTrainLegAgainstTimetable(
  leg: Pick<
    RouteLegOption,
    | 'trainNumber'
    | 'trainName'
    | 'fromStationCode'
    | 'toStationCode'
    | 'departureTime'
    | 'arrivalTime'
    | 'boardingDate'
    | 'arrivalDate'
    | 'durationMinutes'
    | 'distanceKm'
    | 'distanceReliable'
    | 'traceableSourceRecord'
  >,
  trains: TrainService[]
): boolean {
  return validateTrainLegWithReason(leg, trains).valid;
}

/**
 * Feature 1: Direct Train Discovery using the Nationwide Route Graph Index
 */
export function findDirectTrains(
  fromCode: string,
  toCode: string,
  journeyDate: string,
  trains: TrainService[] = TRAIN_SERVICES
): DirectTrainMatch[] {
  const uFrom = (fromCode || '').trim().toUpperCase();
  const uTo = (toCode || '').trim().toUpperCase();
  if (!uFrom || !uTo || uFrom === uTo) return [];
  if (!isValidJourneyDate(journeyDate)) return [];

  const graph = getRouteGraph(trains);
  const fromEntries = graph.trainsAtStation.get(uFrom) || [];
  const toIndicesMap = graph.stopIndicesByStationAndTrain.get(uTo);
  if (fromEntries.length === 0 || !toIndicesMap) return [];

  const results: DirectTrainMatch[] = [];
  const seenTrainStopPairs = new Set<string>();

  for (const { train, stopIdx: fromIdx, stop: fromStop } of fromEntries) {
    const candidateToIndices = toIndicesMap.get(train.trainNumber);
    if (!candidateToIndices || candidateToIndices.length === 0) continue;
    const toIdx = candidateToIndices.find((idx) => idx > fromIdx);
    if (toIdx === undefined || fromIdx >= toIdx) continue;
    const pairKey = `${train.trainNumber}:${fromIdx}->${toIdx}`;
    if (seenTrainStopPairs.has(pairKey)) continue;
    seenTrainStopPairs.add(pairKey);

    if (!isCommercialTrainStop(train, fromIdx) || !isCommercialTrainStop(train, toIdx)) {
      continue;
    }

    const toStop = train.stops[toIdx];
    if (!fromStop.departureTime || !toStop.arrivalTime) continue;

    if (!doesTrainOperateAtStopOnDate(train, fromStop, journeyDate)) continue;

    const durationMinutes = calculateLegDurationMinutes(fromStop, toStop);
    if (durationMinutes <= 0) continue;

    const {
      distanceKm,
      distanceReliable,
      distanceVerified,
      distanceSource,
      distanceSourceLabel,
      verifiedDistanceRangeKm,
    } = calculateVerifiedLegDistance(
      train,
      fromStop,
      toStop,
      fromIdx,
      toIdx,
      trains
    );

    const dayDelta = Math.max(0, toStop.dayOffset - fromStop.dayOffset);
    const arrivalDate = addDaysToDateString(journeyDate, dayDelta);
    const intermediateStops = train.stops.slice(fromIdx + 1, toIdx);
    const histStats = getHistoricalDelayForTrainAtStation(train, uTo);
    const orderedStopSequence = train.stops
      .slice(fromIdx, toIdx + 1)
      .map((s) => s.stationCode.toUpperCase());

    const candidate: DirectTrainMatch = {
      trainNumber: train.trainNumber,
      trainName: train.trainName,
      trainType: train.trainType,
      operatingDays: train.operatingDays,
      operatingDaysAvailable: train.operatingDaysAvailable !== false,
      distanceReliable,
      distanceVerified,
      distanceSource,
      distanceSourceLabel,
      verifiedDistanceRangeKm,
      source: train.source || 'DataMeet Indian Railways Dataset (CC0 1.0)',
      classes: train.classes,
      fromStationCode: fromStop.stationCode,
      fromStationName: fromStop.stationName,
      toStationCode: toStop.stationCode,
      toStationName: toStop.stationName,
      trainOriginCode: train.originCode,
      trainDestinationCode: train.destinationCode,
      boardingDate: journeyDate,
      arrivalDate,
      departureTime: fromStop.departureTime,
      arrivalTime: toStop.arrivalTime,
      durationMinutes,
      distanceKm,
      intermediateStopsCount: intermediateStops.length,
      intermediateStops,
      allStops: train.stops,
      fromPlatform: fromStop.platform,
      toPlatform: toStop.platform,
      historicalReliabilityAtDest: histStats,
      currentDelayMinutes: 0,
      expectedArrivalTime: toStop.arrivalTime,
      dataMode: 'SCHEDULE_ONLY',
      lastUpdatedIso: new Date().toISOString(),
      traceableSourceRecord: {
        dataset: train.source || 'DataMeet Indian Railways Dataset (CC0 1.0)',
        sourceRecordId: `IR-TIMETABLE:${train.trainNumber}:${fromStop.stationCode}@${fromStop.stopSequence}->${toStop.stationCode}@${toStop.stopSequence}`,
        trainNumber: train.trainNumber,
        trainName: train.trainName,
        boardingStationCode: fromStop.stationCode,
        destinationStationCode: toStop.stationCode,
        originStopSequence: fromStop.stopSequence,
        destinationStopSequence: toStop.stopSequence,
        orderedStopSequence,
        scheduledDepartureTime: fromStop.departureTime,
        scheduledArrivalTime: toStop.arrivalTime,
        boardingDate: journeyDate,
        arrivalDate,
        operatingDays: train.operatingDays,
        operatingDayVerified: true,
        validationResult: 'VERIFIED',
      },
    };

    if (
      verifyTrainLegAgainstTimetable(candidate, trains) &&
      !isRedundantCoupledSlipDuplicate(candidate, results)
    ) {
      results.push(candidate);
    }
  }

  results.sort(
    (a, b) => parseTimeToMinutes(a.departureTime) - parseTimeToMinutes(b.departureTime)
  );
  return results;
}

/**
 * Feature 3: Intelligent Interchange & Transfer-Buffer Evaluation
 * Never labels a connection as "Comfortable connection" (SAFE) when historical delay data is unavailable.
 */
export function evaluateTransferConnection(params: {
  interchangeStationCode: string;
  interchangeStationName: string;
  interchangeZone: string;
  incomingLeg: RouteLegOption;
  outgoingLeg: RouteLegOption;
  userTargetBufferMinutes: number;
  samePhysicalStation?: boolean;
  liveIncomingDelayOverride?: number;
}): TransferEvaluation {
  const {
    interchangeStationCode,
    interchangeStationName,
    interchangeZone,
    incomingLeg,
    outgoingLeg,
    userTargetBufferMinutes,
    samePhysicalStation = true,
    liveIncomingDelayOverride,
  } = params;

  const dayDiff = diffDaysBetweenDates(incomingLeg.arrivalDate, outgoingLeg.boardingDate);
  const arrMin = parseTimeToMinutes(incomingLeg.arrivalTime);
  const depMin = parseTimeToMinutes(outgoingLeg.departureTime);
  const scheduledLayoverMinutes = dayDiff * 1440 + (depMin - arrMin);

  const hist = incomingLeg.historicalDelayAtAlighing;
  const liveDelay =
    liveIncomingDelayOverride !== undefined
      ? liveIncomingDelayOverride
      : incomingLeg.currentDelayMinutes;

  const platformTransferMarginMinutes = samePhysicalStation ? 15 : 45;
  const projectedArrivalMinutes = arrMin + liveDelay;
  const projectedArrivalTime = formatMinutesToTime(projectedArrivalMinutes);

  const effectiveLayoverWithLiveDelayMinutes = scheduledLayoverMinutes - liveDelay;
  const effectiveLayoverWithP50Minutes = hist.available
    ? scheduledLayoverMinutes - Math.max(liveDelay, hist.medianDelayMinutes)
    : effectiveLayoverWithLiveDelayMinutes;
  const effectiveLayoverWithP90Minutes = hist.available
    ? scheduledLayoverMinutes - Math.max(liveDelay, hist.p90DelayMinutes)
    : effectiveLayoverWithLiveDelayMinutes;

  const riskReasons: string[] = [];
  let riskStatus: ConnectionRiskStatus = 'Meets scheduled buffer (delay history unavailable)';
  let riskLevel: 'SAFE' | 'CAUTION' | 'HIGH_RISK' | 'MISSED' | 'UNKNOWN' = 'UNKNOWN';

  if (!samePhysicalStation) {
    riskReasons.push('Requires interstation city transit between two separate station codes');
  }

  // 1. Check if connection is impossible (outgoing departs before incoming arrives) or likely missed
  if (
    scheduledLayoverMinutes < platformTransferMarginMinutes ||
    effectiveLayoverWithLiveDelayMinutes < platformTransferMarginMinutes ||
    (hist.available && effectiveLayoverWithP90Minutes < platformTransferMarginMinutes)
  ) {
    riskStatus = 'Connection likely missed';
    riskLevel = 'MISSED';
    if (scheduledLayoverMinutes < 0) {
      riskReasons.push(
        `Outgoing train departs (${outgoingLeg.departureTime} on ${outgoingLeg.boardingDate}) before incoming train arrives (${incomingLeg.arrivalTime} on ${incomingLeg.arrivalDate})`
      );
    } else if (effectiveLayoverWithLiveDelayMinutes < platformTransferMarginMinutes) {
      riskReasons.push(
        `Incoming train delay (${liveDelay}m) leaves only ${effectiveLayoverWithLiveDelayMinutes}m before next departure`
      );
    } else {
      riskReasons.push(
        `90th-percentile historical delay (${hist.p90DelayMinutes}m) leaves under ${platformTransferMarginMinutes}m platform margin`
      );
    }
  }
  // 2. Check high risk
  else if (
    effectiveLayoverWithLiveDelayMinutes < 60 ||
    (hist.available && effectiveLayoverWithP90Minutes < 60) ||
    scheduledLayoverMinutes < Math.min(90, userTargetBufferMinutes - 60)
  ) {
    riskStatus = 'High risk of missing the connection';
    riskLevel = 'HIGH_RISK';
    riskReasons.push(
      `Tight scheduled buffer (${formatDuration(scheduledLayoverMinutes)}) compared to ${formatDuration(userTargetBufferMinutes)} target`
    );
  }
  // 3. Check tighter connection / needs attention
  else if (
    scheduledLayoverMinutes < userTargetBufferMinutes ||
    (hist.available &&
      (effectiveLayoverWithP90Minutes < Math.max(75, userTargetBufferMinutes - 60) ||
        hist.delayedOver60MinPct >= 20))
  ) {
    riskStatus = 'Connection needs attention';
    riskLevel = 'CAUTION';
    if (scheduledLayoverMinutes < userTargetBufferMinutes) {
      riskReasons.push(
        `Scheduled layover (${formatDuration(scheduledLayoverMinutes)}) is tighter than your ${formatDuration(userTargetBufferMinutes)} target buffer`
      );
    }
    if (hist.available && hist.p90DelayMinutes >= 40) {
      riskReasons.push(
        `Incoming train has a ${hist.p90DelayMinutes}m 90th-percentile arrival delay at ${interchangeStationCode}`
      );
    }
  }
  // 4. Meets or exceeds targetBufferMinutes
  else if (hist.available) {
    riskStatus = 'Comfortable connection';
    riskLevel = 'SAFE';
    riskReasons.push(
      `${formatDuration(scheduledLayoverMinutes)} layover meets ${formatDuration(userTargetBufferMinutes)} buffer with ${formatDuration(effectiveLayoverWithP90Minutes)} remaining at P90 delay`
    );
  } else {
    // Historical delay data is unavailable — do not claim connection is SAFE / Comfortable
    riskStatus = 'Meets scheduled buffer (delay history unavailable)';
    riskLevel = 'UNKNOWN';
    riskReasons.push(
      `${formatDuration(scheduledLayoverMinutes)} scheduled layover meets ${formatDuration(userTargetBufferMinutes)} target buffer; historical delay data is unavailable to verify punctuality`
    );
  }

  return {
    interchangeStationCode,
    interchangeStationName,
    interchangeZone,
    samePhysicalStation,
    interstationTransferNote: samePhysicalStation
      ? undefined
      : 'Interstation city transfer required; allow extra transit time.',
    incomingTrainNumber: incomingLeg.trainNumber,
    incomingTrainName: incomingLeg.trainName,
    outgoingTrainNumber: outgoingLeg.trainNumber,
    outgoingTrainName: outgoingLeg.trainName,
    scheduledArrivalTime: incomingLeg.arrivalTime,
    scheduledArrivalDate: incomingLeg.arrivalDate,
    scheduledDepartureTime: outgoingLeg.departureTime,
    scheduledDepartureDate: outgoingLeg.boardingDate,
    scheduledLayoverMinutes,
    incomingHistoricalStats: hist,
    incomingLiveDelayMinutes: liveDelay,
    projectedArrivalTime,
    effectiveLayoverWithLiveDelayMinutes,
    effectiveLayoverWithP50Minutes,
    effectiveLayoverWithP90Minutes,
    platformTransferMarginMinutes,
    userTargetBufferMinutes,
    riskStatus,
    riskLevel,
    riskReasons,
  };
}

/**
 * Feature 15: Transparent 100-Point Route Recommendation Engine
 * Part 3: Bases recommendations strictly on available, verified data; never invents
 * fallback distance scores or historical delay statistics when data is unavailable.
 */
export function calculateRecommendationScore(params: {
  totalDistanceKm: number;
  baselineDistanceKm: number;
  distanceReliable?: boolean;
  totalDurationMinutes: number;
  baselineDurationMinutes: number;
  numberOfTransfers: number;
  transfers: TransferEvaluation[];
  legs: RouteLegOption[];
  targetBufferMinutes: number;
}): RecommendationScoreBreakdown {
  const {
    totalDistanceKm,
    baselineDistanceKm,
    distanceReliable = true,
    totalDurationMinutes,
    baselineDurationMinutes,
    numberOfTransfers,
    transfers,
    legs,
    targetBufferMinutes,
  } = params;

  const explanations: string[] = [];

  // 1. Distance efficiency score (0..100 when verified, 0 when missing)
  const hasVerifiedDistanceComparison =
    distanceReliable && baselineDistanceKm > 0 && totalDistanceKm > 0;
  const extraDistPct = hasVerifiedDistanceComparison
    ? Math.max(0, ((totalDistanceKm - baselineDistanceKm) / baselineDistanceKm) * 100)
    : 0;
  const distanceEfficiencyScore = hasVerifiedDistanceComparison
    ? Math.round(Math.max(0, Math.min(100, 100 - extraDistPct * 2.1)))
    : 0;

  if (!hasVerifiedDistanceComparison) {
    explanations.push(MISSING_TOTAL_DISTANCE_MESSAGE);
  } else if (extraDistPct <= 3) {
    explanations.push('Shortest verified rail distance');
  } else if (extraDistPct <= 12) {
    explanations.push(`Low verified detour (+${extraDistPct.toFixed(1)}% rail distance)`);
  } else if (extraDistPct > 25) {
    explanations.push(`Longer detour (+${extraDistPct.toFixed(1)}% rail distance)`);
  }

  // 2. Connection safety score (0..100)
  let connectionSafetyScore = 100;
  if (transfers.length > 0) {
    const perTransferScores = transfers.map((tx) => {
      if (tx.riskLevel === 'MISSED') return 5;
      if (tx.riskLevel === 'HIGH_RISK') return 35;
      const ratio = Math.min(
        1.25,
        tx.effectiveLayoverWithP90Minutes / Math.max(60, targetBufferMinutes)
      );
      let base = Math.round(Math.max(15, Math.min(100, ratio * 92)));
      if (tx.scheduledLayoverMinutes > 540) {
        base = Math.max(55, base - 15);
      }
      return base;
    });
    connectionSafetyScore = Math.min(...perTransferScores);

    const minLayover = Math.min(...transfers.map((t) => t.scheduledLayoverMinutes));
    if (transfers.every((t) => t.riskLevel === 'SAFE')) {
      explanations.push('Comfortable connection (verified against 30d delay history)');
    } else if (minLayover >= targetBufferMinutes) {
      explanations.push(`Meets ${formatDuration(targetBufferMinutes)} scheduled transfer buffer`);
    }
  }

  // 3. Historical train reliability score (0..100 or null if any leg lacks data)
  const allLegsHaveHistory = legs.every((l) => l.historicalDelayAtAlighing.available);
  let historicalReliabilityScore: number | null = null;
  if (allLegsHaveHistory && legs.length > 0) {
    const legRelScores = legs.map((l) => {
      const h = l.historicalDelayAtAlighing;
      const penalty =
        h.medianDelayMinutes * 0.8 +
        h.p90DelayMinutes * 0.4 +
        h.delayedOver60MinPct * 0.5;
      return Math.max(0, Math.min(100, Math.round(100 - penalty)));
    });
    historicalReliabilityScore = Math.round(
      legRelScores.reduce((a, b) => a + b, 0) / legRelScores.length
    );
    if (historicalReliabilityScore >= 80) {
      explanations.push('Lower observed delay risk');
    }
  } else {
    explanations.push('Historical delay data unavailable');
  }

  // 4. Journey duration score (0..100)
  const refDuration = Math.max(180, baselineDurationMinutes);
  const durationRatio = refDuration / Math.max(refDuration, totalDurationMinutes);
  const journeyDurationScore = Math.round(
    Math.max(15, Math.min(100, durationRatio * 100))
  );

  // 5. Transfer complexity score (0..100)
  const transferComplexityScore =
    numberOfTransfers <= 1 ? 100 : numberOfTransfers === 2 ? 55 : 20;
  if (numberOfTransfers >= 2) {
    explanations.push('One extra train change');
  }

  // Renormalize weights strictly over the available verified metrics
  const rawWeights = {
    distanceEfficiency: hasVerifiedDistanceComparison ? 0.35 : 0,
    connectionSafety: 0.25,
    historicalReliability: historicalReliabilityScore !== null ? 0.2 : 0,
    journeyDuration: 0.15,
    transferComplexity: 0.05,
  };
  const weightSum =
    rawWeights.distanceEfficiency +
    rawWeights.connectionSafety +
    rawWeights.historicalReliability +
    rawWeights.journeyDuration +
    rawWeights.transferComplexity;

  const weightsRenormalized =
    !hasVerifiedDistanceComparison || historicalReliabilityScore === null;
  const dataConfidence: 'High' | 'Medium (Historical Delay Unavailable)' | 'Low' =
    historicalReliabilityScore !== null
      ? 'High'
      : 'Medium (Historical Delay Unavailable)';

  const weightsUsed = {
    distanceEfficiency: Number((rawWeights.distanceEfficiency / weightSum).toFixed(4)),
    connectionSafety: Number((rawWeights.connectionSafety / weightSum).toFixed(4)),
    historicalReliability: Number((rawWeights.historicalReliability / weightSum).toFixed(4)),
    journeyDuration: Number((rawWeights.journeyDuration / weightSum).toFixed(4)),
    transferComplexity: Number((rawWeights.transferComplexity / weightSum).toFixed(4)),
  };

  const totalScore = Math.round(
    distanceEfficiencyScore * weightsUsed.distanceEfficiency +
      connectionSafetyScore * weightsUsed.connectionSafety +
      (historicalReliabilityScore ?? 0) * weightsUsed.historicalReliability +
      journeyDurationScore * weightsUsed.journeyDuration +
      transferComplexityScore * weightsUsed.transferComplexity
  );

  const scoreAvailable = legs.length > 0 && totalDurationMinutes > 0;
  const boundedScore = Math.max(1, Math.min(100, totalScore));

  return {
    totalScore: scoreAvailable ? boundedScore : 0,
    scoreAvailable,
    scoreStatusMessage: scoreAvailable
      ? `${boundedScore}/100`
      : 'Score unavailable — insufficient verified data.',
    scheduleDisclaimer:
      'Schedule-based recommendation only — not a guarantee of punctuality or connection safety.',
    distanceEfficiencyScore,
    connectionSafetyScore,
    historicalReliabilityScore,
    journeyDurationScore,
    transferComplexityScore,
    weightsUsed,
    weightsRenormalized,
    dataConfidence,
    explanations,
  };
}

/**
 * Builds a concise, data-justified recommendation label for a route option card
 * based strictly on verified timetable metrics.
 */
export function buildRouteRecommendationLabel(params: {
  distanceReliable: boolean;
  totalDistanceKm: number;
  extraDistancePct: number;
  numberOfTransfers: number;
  transfers: TransferEvaluation[];
  targetBufferMinutes: number;
}): string {
  const {
    distanceReliable,
    totalDistanceKm,
    extraDistancePct,
    numberOfTransfers,
    transfers,
    targetBufferMinutes,
  } = params;

  const meetsAllScheduledBuffers =
    transfers.length > 0 &&
    transfers.every((t) => t.scheduledLayoverMinutes >= targetBufferMinutes);
  const allSafeWithHistory =
    transfers.length > 0 && transfers.every((t) => t.riskLevel === 'SAFE');

  if (distanceReliable && totalDistanceKm > 0) {
    if (extraDistancePct <= 3 && meetsAllScheduledBuffers) {
      return 'Recommended — Shortest verified rail distance';
    }
    if (extraDistancePct <= 15 && meetsAllScheduledBuffers) {
      return `Recommended — Verified low-detour route (+${extraDistancePct}% rail distance)`;
    }
    if (meetsAllScheduledBuffers) {
      return 'Verified rail distance · Meets scheduled transfer buffer';
    }
    return 'Verified rail distance · Tighter scheduled transfer';
  }

  if (allSafeWithHistory && numberOfTransfers === 1) {
    return 'Recommended — 1 transfer with verified delay buffer';
  }
  if (meetsAllScheduledBuffers && numberOfTransfers === 1) {
    return 'Recommended — 1 change meeting scheduled transfer buffer';
  }
  if (meetsAllScheduledBuffers) {
    return `Meets ${formatDuration(targetBufferMinutes)} scheduled transfer buffer (${numberOfTransfers} changes)`;
  }
  return 'Tighter scheduled transfer alternative';
}

/**
 * Helper to build RouteLegOption from a TrainService between two stop indices on a boarding date
 */
export function buildRouteLegOption(
  legIndex: number,
  train: TrainService,
  fromStop: TrainStop,
  toStop: TrainStop,
  boardingDate: string,
  fromIdx?: number,
  toIdx?: number,
  trains?: TrainService[]
): RouteLegOption {
  const durationMinutes = calculateLegDurationMinutes(fromStop, toStop);
  const actualFromIdx =
    fromIdx !== undefined
      ? fromIdx
      : train.stops.findIndex((s) => s.stationCode === fromStop.stationCode);
  const actualToIdx =
    toIdx !== undefined
      ? toIdx
      : train.stops.findIndex((s) => s.stationCode === toStop.stationCode);

  const {
    distanceKm,
    distanceReliable,
    distanceVerified,
    distanceSource,
    distanceSourceLabel,
    verifiedDistanceRangeKm,
  } = calculateVerifiedLegDistance(
    train,
    fromStop,
    toStop,
    actualFromIdx,
    actualToIdx,
    trains
  );

  const dayDelta = Math.max(0, toStop.dayOffset - fromStop.dayOffset);
  const arrivalDate = addDaysToDateString(boardingDate, dayDelta);
  const legStops = train.stops.slice(actualFromIdx, actualToIdx + 1);
  const orderedStopSequence = legStops.map((s) => s.stationCode.toUpperCase());

  return {
    legIndex,
    fromStationCode: fromStop.stationCode,
    fromStationName: fromStop.stationName,
    toStationCode: toStop.stationCode,
    toStationName: toStop.stationName,
    trainNumber: train.trainNumber,
    trainName: train.trainName,
    trainType: train.trainType,
    operatingDays: train.operatingDays,
    operatingDaysAvailable: train.operatingDaysAvailable !== false,
    distanceReliable,
    distanceVerified,
    distanceSource,
    distanceSourceLabel,
    verifiedDistanceRangeKm,
    source: train.source || 'DataMeet Indian Railways Dataset (CC0 1.0)',
    classes: train.classes,
    boardingDate,
    arrivalDate,
    departureTime: fromStop.departureTime || '00:00',
    arrivalTime: toStop.arrivalTime || '00:00',
    durationMinutes,
    distanceKm,
    fromPlatform: fromStop.platform,
    toPlatform: toStop.platform,
    intermediateStopsCount: Math.max(0, legStops.length - 2),
    stops: legStops,
    historicalDelayAtAlighing: getHistoricalDelayForTrainAtStation(
      train,
      toStop.stationCode
    ),
    currentDelayMinutes: 0,
    traceableSourceRecord: {
      dataset: train.source || 'DataMeet Indian Railways Dataset (CC0 1.0)',
      sourceRecordId: `IR-TIMETABLE:${train.trainNumber}:${fromStop.stationCode}@${fromStop.stopSequence}->${toStop.stationCode}@${toStop.stopSequence}`,
      trainNumber: train.trainNumber,
      trainName: train.trainName,
      boardingStationCode: fromStop.stationCode,
      destinationStationCode: toStop.stationCode,
      originStopSequence: fromStop.stopSequence,
      destinationStopSequence: toStop.stopSequence,
      orderedStopSequence,
      scheduledDepartureTime: fromStop.departureTime || '00:00',
      scheduledArrivalTime: toStop.arrivalTime || '00:00',
      boardingDate,
      arrivalDate,
      operatingDays: train.operatingDays,
      operatingDayVerified: true,
      validationResult: 'VERIFIED',
    },
  };
}

/**
 * Checks if two legs cause circular travel, prior-corridor backtracking, or trunk-line overshoot reversal.
 */
function hasBacktrackingBetweenLegs(
  legA: RouteLegOption,
  legB: RouteLegOption,
  graph?: RailwayRouteGraph
): boolean {
  const isAdjacentTransfer =
    legA.toStationCode.trim().toUpperCase() ===
    legB.fromStationCode.trim().toUpperCase();

  if (isAdjacentTransfer) {
    // 1a. Adjacent legs: no stop in legA prior to the interchange may appear anywhere in legB,
    // and the interchange station itself may not appear again in legB after index 0.
    const visitedBeforeInterchangeInA = new Set<string>();
    for (let i = 0; i < legA.stops.length - 1; i++) {
      visitedBeforeInterchangeInA.add(legA.stops[i].stationCode.toUpperCase());
    }
    for (let i = 0; i < legB.stops.length; i++) {
      if (visitedBeforeInterchangeInA.has(legB.stops[i].stationCode.toUpperCase())) {
        return true;
      }
    }
    const icCode = legA.toStationCode.trim().toUpperCase();
    for (let i = 1; i < legB.stops.length; i++) {
      if (legB.stops[i].stationCode.toUpperCase() === icCode) {
        return true;
      }
    }

    // 1b. Corridor-bridge physical reversal check at the interchange:
    // If legA's final segment into the interchange physically bridges through an intermediate station M
    // (on the railway corridor) and legB immediately travels back through M, or if legB's initial segment
    // out of the interchange bridges through a station already visited by legA prior to the interchange,
    // then the passenger has overshot the junction and doubled back on the same physical track.
    if (graph && legA.stops.length >= 2 && legB.stops.length >= 2) {
      const prevInA = legA.stops[legA.stops.length - 2].stationCode.toUpperCase();
      const bridgedInApproachA = graph.corridorBridgeMap.get(`${prevInA}->${icCode}`);
      if (bridgedInApproachA && bridgedInApproachA.size > 0) {
        for (let i = 1; i < legB.stops.length; i++) {
          if (bridgedInApproachA.has(legB.stops[i].stationCode.toUpperCase())) {
            return true;
          }
        }
      }

      const nextInB = legB.stops[1].stationCode.toUpperCase();
      const bridgedInDepartB = graph.corridorBridgeMap.get(`${icCode}->${nextInB}`);
      if (bridgedInDepartB && bridgedInDepartB.size > 0) {
        for (const bridgedCode of bridgedInDepartB) {
          if (visitedBeforeInterchangeInA.has(bridgedCode)) {
            return true;
          }
        }
      }
    }
  } else {
    // 1c. Non-adjacent legs (e.g., leg1 and leg3 in a 3-leg route): zero shared stations allowed.
    const allVisitedInA = new Set<string>();
    for (let i = 0; i < legA.stops.length; i++) {
      allVisitedInA.add(legA.stops[i].stationCode.toUpperCase());
    }
    for (let i = 0; i < legB.stops.length; i++) {
      if (allVisitedInA.has(legB.stops[i].stationCode.toUpperCase())) {
        return true;
      }
    }
  }

  if (!graph) return false;

  const trainA = graph.trainByNumber.get(legA.trainNumber);
  const trainB = graph.trainByNumber.get(legB.trainNumber);
  if (!trainA || !trainB) return false;

  const aFromIdx = trainA.stops.findIndex(
    (s) => s.stationCode.toUpperCase() === legA.fromStationCode.toUpperCase()
  );
  const aToIdx = trainA.stops.findIndex(
    (s) => s.stationCode.toUpperCase() === legA.toStationCode.toUpperCase()
  );
  const bFromIdx = trainB.stops.findIndex(
    (s) => s.stationCode.toUpperCase() === legB.fromStationCode.toUpperCase()
  );
  const bToIdx = trainB.stops.findIndex(
    (s) => s.stationCode.toUpperCase() === legB.toStationCode.toUpperCase()
  );

  if (aFromIdx < 0 || aToIdx < 0 || bFromIdx < 0 || bToIdx < 0) return false;

  // 2. Prior-corridor backtracking:
  // If legB visits any station that trainA ALREADY passed before legA.fromStationCode,
  // or if trainB BEFORE legB.fromStationCode already passed any station in legA (prior to interchange),
  // then the route is doubling back along the same corridor.
  const priorToLegA = new Set<string>();
  for (let i = 0; i < aFromIdx; i++) {
    priorToLegA.add(trainA.stops[i].stationCode.toUpperCase());
  }
  for (let i = 1; i < legB.stops.length; i++) {
    if (priorToLegA.has(legB.stops[i].stationCode.toUpperCase())) {
      return true;
    }
  }

  const priorToLegB = new Set<string>();
  for (let i = 0; i < bFromIdx; i++) {
    priorToLegB.add(trainB.stops[i].stationCode.toUpperCase());
  }
  for (let i = 0; i < legA.stops.length - 1; i++) {
    if (priorToLegB.has(legA.stops[i].stationCode.toUpperCase())) {
      return true;
    }
  }

  // 3. Trunk-corridor overshoot reversal:
  // If trainA continues AFTER the interchange through >= 3 stations that trainB just came FROM
  // BEFORE the interchange, trainA and trainB are running in opposite directions on the same
  // multi-station trunk line and the interchange is a wayside overshoot rather than a branching hub.
  const afterLegA = new Set<string>();
  for (let i = aToIdx + 1; i < trainA.stops.length; i++) {
    afterLegA.add(trainA.stops[i].stationCode.toUpperCase());
  }
  let sharedOppositeTrunkCount = 0;
  for (const code of priorToLegB) {
    if (afterLegA.has(code)) {
      sharedOppositeTrunkCount++;
      if (sharedOppositeTrunkCount >= 3) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Requirement 4 & 5: Comprehensive Multi-Route Candidate Validator.
 * Verifies every leg against actual stop sequences, verifies station continuity at every
 * interchange, rejects circular/backtracking paths, and validates transfer timing and buffers.
 */
export function validateMultiRouteCandidate(
  route: MultiRouteCandidate,
  trains: TrainService[],
  minLayoverMinutes = 35
): LegValidationAuditResult {
  if (!route || !Array.isArray(route.selectedLegs) || route.selectedLegs.length < 2) {
    return { valid: false, reason: 'Multi-route candidate must have at least 2 legs.' };
  }
  if (route.stationSequence.length !== route.selectedLegs.length + 1) {
    return { valid: false, reason: 'stationSequence length does not match selectedLegs count.' };
  }

  // Verify no duplicate stations in stationSequence
  const seenSeqStations = new Set<string>();
  for (const st of route.stationSequence) {
    const code = (st || '').trim().toUpperCase();
    if (!code || seenSeqStations.has(code)) {
      return { valid: false, reason: `Duplicate or invalid station "${code}" in stationSequence.` };
    }
    seenSeqStations.add(code);
  }

  const graph = getRouteGraph(trains);

  // Verify each leg against the actual imported timetable
  for (let i = 0; i < route.selectedLegs.length; i++) {
    const leg = route.selectedLegs[i];
    const expectedFrom = route.stationSequence[i].trim().toUpperCase();
    const expectedTo = route.stationSequence[i + 1].trim().toUpperCase();
    if (
      leg.fromStationCode.trim().toUpperCase() !== expectedFrom ||
      leg.toStationCode.trim().toUpperCase() !== expectedTo
    ) {
      return {
        valid: false,
        reason: `Leg ${i + 1} endpoints (${leg.fromStationCode}->${leg.toStationCode}) do not match route sequence (${expectedFrom}->${expectedTo}).`,
      };
    }
    const legAudit = validateTrainLegWithReason(leg, trains);
    if (!legAudit.valid) {
      return { valid: false, reason: `Leg ${i + 1} failed validation: ${legAudit.reason}` };
    }
  }

  // Verify station continuity, transfer timing, and zero backtracking across all pairs of legs
  for (let i = 0; i < route.selectedLegs.length - 1; i++) {
    const legA = route.selectedLegs[i];
    const legB = route.selectedLegs[i + 1];
    const icCodeA = legA.toStationCode.trim().toUpperCase();
    const icCodeB = legB.fromStationCode.trim().toUpperCase();
    const expectedIc = route.interchangeStations[i]?.code?.trim().toUpperCase();
    if (icCodeA !== icCodeB || icCodeA !== expectedIc) {
      return {
        valid: false,
        reason: `Interchange station continuity mismatch between Leg ${i + 1} (${icCodeA}) and Leg ${i + 2} (${icCodeB}).`,
      };
    }
    if (hasBacktrackingBetweenLegs(legA, legB, graph)) {
      return {
        valid: false,
        reason: `Backtracking or corridor reversal detected between Leg ${i + 1} (${legA.trainNumber}) and Leg ${i + 2} (${legB.trainNumber}) at ${icCodeA}.`,
      };
    }
    const tx = route.transfers[i];
    if (!tx || tx.interchangeStationCode.trim().toUpperCase() !== icCodeA) {
      return { valid: false, reason: `Missing or mismatched transfer record at ${icCodeA}.` };
    }
    const dayDiff = diffDaysBetweenDates(legA.arrivalDate, legB.boardingDate);
    const arrMin = parseTimeToMinutes(legA.arrivalTime);
    const depMin = parseTimeToMinutes(legB.departureTime);
    const computedLayover = dayDiff * 1440 + (depMin - arrMin);
    if (computedLayover < minLayoverMinutes || computedLayover !== tx.scheduledLayoverMinutes) {
      return {
        valid: false,
        reason: `Invalid transfer layover (${computedLayover}m) at ${icCodeA} between ${legA.trainNumber} and ${legB.trainNumber}.`,
      };
    }
  }

  if (route.selectedLegs.length === 3) {
    if (hasBacktrackingBetweenLegs(route.selectedLegs[0], route.selectedLegs[2], graph)) {
      return {
        valid: false,
        reason: 'Backtracking detected between Leg 1 and Leg 3 in 3-leg route.',
      };
    }
  }

  return { valid: true };
}

export function classifyDistanceCategory(
  extraDistancePct: number
): RouteDistanceCategory {
  if (extraDistancePct <= 10) return 'Low-distance alternatives';
  if (extraDistancePct <= 25) return 'Recommended alternatives';
  return 'Longer-distance alternatives';
}

/**
 * Feature 2 & 5: General Nationwide Multi-Route Discovery using Station-to-Train Graph Index.
 *
 * Defaults to `includeTighterConnections = false` so only connections meeting `targetBufferMinutes`
 * are recommended unless the user explicitly enables tighter connections.
 */
export function findMultiRoutes(params: {
  fromCode: string;
  toCode: string;
  journeyDate: string;
  targetBufferMinutes?: number;
  maxDetourPct?: number;
  includeTighterConnections?: boolean;
  maxLegs?: 2 | 3;
  stationsDirectory?: NormalizedStation[];
  trains?: TrainService[];
}): MultiRouteSearchResponse {
  const {
    fromCode,
    toCode,
    journeyDate,
    targetBufferMinutes = 180,
    maxDetourPct = 25,
    includeTighterConnections = false,
    maxLegs = 3,
    stationsDirectory = [],
    trains = TRAIN_SERVICES,
  } = params;

  const uFrom = (fromCode || '').trim().toUpperCase();
  const uTo = (toCode || '').trim().toUpperCase();
  const stationMap = new Map(
    stationsDirectory.map((s) => [s.code.toUpperCase(), s])
  );

  const getStationName = (code: string, fallback?: string) =>
    stationMap.get(code)?.displayName || fallback || code;
  const getStationZone = (code: string) => stationMap.get(code)?.zone || 'IR';

  const graph = getRouteGraph(trains);
  const originEntries = uFrom ? graph.trainsAtStation.get(uFrom) || [] : [];
  const destEntries = uTo ? graph.trainsAtStation.get(uTo) || [] : [];
  const destStopIdxByTrain = uTo ? graph.stopIdxByStationAndTrain.get(uTo) : undefined;

  if (!uFrom || !uTo || uFrom === uTo || !isValidJourneyDate(journeyDate)) {
    const originName = getStationName(uFrom);
    const destinationName = getStationName(uTo);
    const isDateInvalid = !isValidJourneyDate(journeyDate);
    return {
      originCode: uFrom,
      originName,
      destinationCode: uTo,
      destinationName,
      journeyDate,
      targetBufferMinutes,
      maxDetourPct,
      includeTighterConnections,
      baselineDistanceKm: 0,
      baselineType: 'SHORTEST_FEASIBLE_PATH_BASELINE',
      directTrainsCount: 0,
      directTrains: [],
      routes: [],
      hiddenLongerRoutesCount: 0,
      diagnostics: {
        status: isDateInvalid ? 'INVALID_JOURNEY_DATE' : 'NO_FEASIBLE_CONNECTIONS_WITHIN_CONSTRAINTS',
        originTrainsCount: originEntries.length,
        destinationTrainsCount: destEntries.length,
        directTrainsAnyDayCount: 0,
        directTrainsOnDateCount: 0,
        multiRoutesUnfilteredCount: 0,
        summary: isDateInvalid
          ? `Invalid journey date "${journeyDate}". Please provide a valid calendar date in YYYY-MM-DD format.`
          : 'Origin and destination station codes must be distinct.',
        reasons: isDateInvalid
          ? ['Journey date failed calendar validation (expected valid YYYY-MM-DD date).']
          : ['Origin and destination cannot be the same station code.'],
        timetableSource: 'DataMeet Indian Railways Dataset (CC0 1.0 Public Domain)',
        totalTimetableTrains: trains.length,
      },
      dataMode: 'SCHEDULE_ONLY',
      computedAtIso: new Date().toISOString(),
    };
  }

  // Check direct trains on journeyDate and any-day direct trains
  const directOnDate = findDirectTrains(uFrom, uTo, journeyDate, trains);
  let directTrainsAnyDayCount = 0;
  let directBaselineKm = 0;

  if (destStopIdxByTrain) {
    for (const { train, stopIdx: fIdx, stop: fStop } of originEntries) {
      const tIdx = destStopIdxByTrain.get(train.trainNumber);
      if (tIdx !== undefined && fIdx < tIdx) {
        if (!isCommercialTrainStop(train, fIdx) || !isCommercialTrainStop(train, tIdx)) {
          continue;
        }
        directTrainsAnyDayCount++;
        const toStop = train.stops[tIdx];
        const verifiedDirectDist = calculateVerifiedLegDistance(
          train,
          fStop,
          toStop,
          fIdx,
          tIdx,
          trains
        );
        const hasVerifiedDist = verifiedDirectDist.distanceReliable;
        const dist = verifiedDirectDist.distanceKm;
        if (
          hasVerifiedDist &&
          dist > 0 &&
          (directBaselineKm === 0 || dist < directBaselineKm)
        ) {
          directBaselineKm = dist;
        }
      }
    }
  }

  // Requirement 3: Only recommend connections meeting the selected buffer requirements by default
  const minLayoverAllowed = includeTighterConnections ? 35 : targetBufferMinutes;
  const maxLayoverAllowed = 18 * 60;

  const sequenceGroups = new Map<
    string,
    {
      stationSequence: string[];
      seenComboKeys: Set<string>;
      combinations: Array<{
        legs: RouteLegOption[];
        transfers: TransferEvaluation[];
        totalDistanceKm: number;
        distanceReliable: boolean;
        totalDurationMinutes: number;
      }>;
    }
  >();

  // Identify trains that run directly from uFrom to uTo on journeyDate so we don't split an active direct train into two legs
  const directTrainNumbers = new Set<string>(directOnDate.map((d) => d.trainNumber));

  // Step 1: Forward reachability from uFrom on journeyDate (Leg 1 options grouped by mid1 station)
  const firstLegByDest = new Map<string, RouteLegOption[]>();
  for (const { train, stopIdx: fIdx, stop: fromStop } of originEntries) {
    if (directTrainNumbers.has(train.trainNumber)) continue;
    if (!fromStop.departureTime || !isCommercialTrainStop(train, fIdx)) continue;
    if (!doesTrainOperateAtStopOnDate(train, fromStop, journeyDate)) continue;

    for (let i = fIdx + 1; i < train.stops.length; i++) {
      if (!isCommercialTrainStop(train, i)) continue;
      const midStop = train.stops[i];
      const midCode = midStop.stationCode.toUpperCase();
      if (midCode === uTo || midCode === uFrom || !midStop.arrivalTime) continue;
      const opt = buildRouteLegOption(
        0,
        train,
        fromStop,
        midStop,
        journeyDate,
        fIdx,
        i
      );
      if (!verifyTrainLegAgainstTimetable(opt, trains)) continue;
      let list = firstLegByDest.get(midCode);
      if (!list) {
        list = [];
        firstLegByDest.set(midCode, list);
      }
      list.push(opt);
    }
  }

  // Step 2: Backward reachability into uTo (all trains reaching uTo from any prior station mid)
  const lastLegServicesByMid = new Map<
    string,
    Array<{ train: TrainService; midIdx: number; toIdx: number }>
  >();
  for (const { train, stopIdx: tIdx, stop: toStop } of destEntries) {
    if (directTrainNumbers.has(train.trainNumber)) continue;
    if (!toStop.arrivalTime || !isCommercialTrainStop(train, tIdx)) continue;

    for (let k = 0; k < tIdx; k++) {
      if (!isCommercialTrainStop(train, k)) continue;
      const midStop = train.stops[k];
      const midCode = midStop.stationCode.toUpperCase();
      if (midCode === uFrom || midCode === uTo || !midStop.departureTime) continue;
      let list = lastLegServicesByMid.get(midCode);
      if (!list) {
        list = [];
        lastLegServicesByMid.set(midCode, list);
      }
      list.push({ train, midIdx: k, toIdx: tIdx });
    }
  }

  const lastLegsMemo = new Map<string, RouteLegOption[]>();
  const buildLastLegsOnDate = (
    legIndex: number,
    midCode: string,
    depDate: string
  ): RouteLegOption[] => {
    const cacheKey = `${legIndex}_${midCode}_${depDate}`;
    const cached = lastLegsMemo.get(cacheKey);
    if (cached) return cached;

    const services = lastLegServicesByMid.get(midCode);
    if (!services) {
      lastLegsMemo.set(cacheKey, []);
      return [];
    }
    const options: RouteLegOption[] = [];
    for (const { train, midIdx, toIdx } of services) {
      const midStop = train.stops[midIdx];
      const toStop = train.stops[toIdx];
      if (!doesTrainOperateAtStopOnDate(train, midStop, depDate)) continue;
      const opt = buildRouteLegOption(
        legIndex,
        train,
        midStop,
        toStop,
        depDate,
        midIdx,
        toIdx
      );
      if (!verifyTrainLegAgainstTimetable(opt, trains)) continue;
      options.push(opt);
    }
    options.sort((a, b) => a.durationMinutes - b.durationMinutes);
    const top = options.slice(0, 12);
    lastLegsMemo.set(cacheKey, top);
    return top;
  };

  // Step 3: Evaluate 2-Leg (1-Transfer) Routes via graph intersection: uFrom -> mid1 -> uTo
  for (const [mid1, rawLeg1Options] of firstLegByDest.entries()) {
    if (!lastLegServicesByMid.has(mid1)) continue;
    const leg1Options = [...rawLeg1Options]
      .sort((a, b) => a.durationMinutes - b.durationMinutes)
      .slice(0, 12);

    for (const leg1 of leg1Options) {
      const candidateDates = [
        leg1.arrivalDate,
        addDaysToDateString(leg1.arrivalDate, 1),
      ];
      for (const depDate of candidateDates) {
        const leg2Options = buildLastLegsOnDate(1, mid1, depDate);
        for (const leg2 of leg2Options) {
          if (leg1.trainNumber === leg2.trainNumber) continue;
          if (hasBacktrackingBetweenLegs(leg1, leg2, graph)) continue;

          const tx = evaluateTransferConnection({
            interchangeStationCode: mid1,
            interchangeStationName: getStationName(mid1, leg1.toStationName),
            interchangeZone: getStationZone(mid1),
            incomingLeg: leg1,
            outgoingLeg: leg2,
            userTargetBufferMinutes: targetBufferMinutes,
          });

          if (
            tx.scheduledLayoverMinutes < minLayoverAllowed ||
            tx.scheduledLayoverMinutes > maxLayoverAllowed
          ) {
            continue;
          }

          const distanceReliable =
            leg1.distanceReliable !== false &&
            leg2.distanceReliable !== false &&
            leg1.distanceKm > 0 &&
            leg2.distanceKm > 0;
          const totalDistanceKm = distanceReliable
            ? leg1.distanceKm + leg2.distanceKm
            : 0;
          const totalDurationMinutes =
            leg1.durationMinutes +
            tx.scheduledLayoverMinutes +
            leg2.durationMinutes;

          const seqKey = `${uFrom}->${mid1}->${uTo}`;
          let group = sequenceGroups.get(seqKey);
          if (!group) {
            group = {
              stationSequence: [uFrom, mid1, uTo],
              seenComboKeys: new Set<string>(),
              combinations: [],
            };
            sequenceGroups.set(seqKey, group);
          }
          const comboKey = `${leg1.trainNumber}@${leg1.boardingDate}|${leg2.trainNumber}@${leg2.boardingDate}`;
          if (group.seenComboKeys.has(comboKey)) continue;
          group.seenComboKeys.add(comboKey);
          group.combinations.push({
            legs: [leg1, leg2],
            transfers: [tx],
            totalDistanceKm,
            distanceReliable,
            totalDurationMinutes,
          });
        }
      }
    }
  }

  // Step 4: Evaluate 3-Leg (2-Transfer) Routes via indexed hubs: uFrom -> mid1 -> mid2 -> uTo
  if (maxLegs >= 3) {
    const rankedMid1 = Array.from(firstLegByDest.entries())
      .sort((a, b) => {
        const isMajA = stationMap.get(a[0])?.isMajorInterchange ? 1 : 0;
        const isMajB = stationMap.get(b[0])?.isMajorInterchange ? 1 : 0;
        if (isMajB !== isMajA) return isMajB - isMajA;
        const degA = (graph.trainsAtStation.get(a[0]) || []).length;
        const degB = (graph.trainsAtStation.get(b[0]) || []).length;
        return degB - degA;
      })
      .slice(0, 12);

    for (const [mid1, leg1Options] of rankedMid1) {
      const mid1Entries = (graph.trainsAtStation.get(mid1) || []).slice(0, 35);
      const topLeg1s = [...leg1Options]
        .sort((a, b) => a.durationMinutes - b.durationMinutes)
        .slice(0, 2);

      for (const leg1 of topLeg1s) {
        const leg1Train = graph.trainByNumber.get(leg1.trainNumber);
        const leg1StopCodes = new Set(
          (leg1Train?.stops || []).map((s) => s.stationCode.toUpperCase())
        );

        const candidateDates1 = [
          leg1.arrivalDate,
          addDaysToDateString(leg1.arrivalDate, 1),
        ];

        for (const depDate1 of candidateDates1) {
          for (const { train: train2, stopIdx: m1Idx, stop: stopM1 } of mid1Entries) {
            if (
              directTrainNumbers.has(train2.trainNumber) ||
              train2.trainNumber === leg1.trainNumber
            ) {
              continue;
            }
            if (!stopM1.departureTime || !isCommercialTrainStop(train2, m1Idx)) continue;
            if (!doesTrainOperateAtStopOnDate(train2, stopM1, depDate1)) continue;

            // If train2 already reaches uTo directly from mid1, that is a 2-leg route, so skip 3-leg split
            const t2DestIdx = destStopIdxByTrain?.get(train2.trainNumber);
            if (t2DestIdx !== undefined && t2DestIdx > m1Idx) continue;

            for (let j = m1Idx + 1; j < train2.stops.length; j++) {
              if (!isCommercialTrainStop(train2, j)) continue;
              const stopM2 = train2.stops[j];
              const mid2 = stopM2.stationCode.toUpperCase();
              if (
                mid2 === uFrom ||
                mid2 === mid1 ||
                mid2 === uTo ||
                !stopM2.arrivalTime
              ) {
                continue;
              }
              if (!lastLegServicesByMid.has(mid2)) continue;
              if (leg1StopCodes.has(mid2)) continue;

              const leg2 = buildRouteLegOption(
                1,
                train2,
                stopM1,
                stopM2,
                depDate1,
                m1Idx,
                j
              );
              if (!verifyTrainLegAgainstTimetable(leg2, trains)) continue;
              if (hasBacktrackingBetweenLegs(leg1, leg2, graph)) continue;

              const tx1 = evaluateTransferConnection({
                interchangeStationCode: mid1,
                interchangeStationName: getStationName(mid1, leg1.toStationName),
                interchangeZone: getStationZone(mid1),
                incomingLeg: leg1,
                outgoingLeg: leg2,
                userTargetBufferMinutes: targetBufferMinutes,
              });
              if (
                tx1.scheduledLayoverMinutes < minLayoverAllowed ||
                tx1.scheduledLayoverMinutes > maxLayoverAllowed
              ) {
                continue;
              }

              const candidateDates2 = [
                leg2.arrivalDate,
                addDaysToDateString(leg2.arrivalDate, 1),
              ];
              for (const depDate2 of candidateDates2) {
                const leg3Options = buildLastLegsOnDate(2, mid2, depDate2).slice(
                  0,
                  4
                );
                for (const leg3 of leg3Options) {
                  if (
                    leg3.trainNumber === leg2.trainNumber ||
                    leg3.trainNumber === leg1.trainNumber
                  ) {
                    continue;
                  }
                  if (
                    hasBacktrackingBetweenLegs(leg1, leg3, graph) ||
                    hasBacktrackingBetweenLegs(leg2, leg3, graph)
                  ) {
                    continue;
                  }

                  const tx2 = evaluateTransferConnection({
                    interchangeStationCode: mid2,
                    interchangeStationName: getStationName(
                      mid2,
                      leg2.toStationName
                    ),
                    interchangeZone: getStationZone(mid2),
                    incomingLeg: leg2,
                    outgoingLeg: leg3,
                    userTargetBufferMinutes: targetBufferMinutes,
                  });
                  if (
                    tx2.scheduledLayoverMinutes < minLayoverAllowed ||
                    tx2.scheduledLayoverMinutes > maxLayoverAllowed
                  ) {
                    continue;
                  }

                  const distanceReliable =
                    leg1.distanceReliable !== false &&
                    leg2.distanceReliable !== false &&
                    leg3.distanceReliable !== false &&
                    leg1.distanceKm > 0 &&
                    leg2.distanceKm > 0 &&
                    leg3.distanceKm > 0;
                  const totalDistanceKm = distanceReliable
                    ? leg1.distanceKm + leg2.distanceKm + leg3.distanceKm
                    : 0;
                  const totalDurationMinutes =
                    leg1.durationMinutes +
                    tx1.scheduledLayoverMinutes +
                    leg2.durationMinutes +
                    tx2.scheduledLayoverMinutes +
                    leg3.durationMinutes;

                  const seqKey = `${uFrom}->${mid1}->${mid2}->${uTo}`;
                  let group = sequenceGroups.get(seqKey);
                  if (!group) {
                    group = {
                      stationSequence: [uFrom, mid1, mid2, uTo],
                      seenComboKeys: new Set<string>(),
                      combinations: [],
                    };
                    sequenceGroups.set(seqKey, group);
                  }
                  const comboKey = `${leg1.trainNumber}@${leg1.boardingDate}|${leg2.trainNumber}@${leg2.boardingDate}|${leg3.trainNumber}@${leg3.boardingDate}`;
                  if (group.seenComboKeys.has(comboKey)) continue;
                  group.seenComboKeys.add(comboKey);
                  group.combinations.push({
                    legs: [leg1, leg2, leg3],
                    transfers: [tx1, tx2],
                    totalDistanceKm,
                    distanceReliable,
                    totalDurationMinutes,
                  });
                }
              }
            }
          }
        }
      }
    }
  }

  // Determine baseline distance, baseline duration, and minimum in-train travel time
  const reliableDistances: number[] = [];
  const allDurations: number[] = [];
  const allInTrainMinutes: number[] = [];
  for (const g of sequenceGroups.values()) {
    for (const c of g.combinations) {
      allDurations.push(c.totalDurationMinutes);
      const inTrain = c.legs.reduce((sum, l) => sum + l.durationMinutes, 0);
      allInTrainMinutes.push(inTrain);
      if (c.distanceReliable && c.totalDistanceKm > 0) {
        reliableDistances.push(c.totalDistanceKm);
      }
    }
  }
  const minInTrainMinutes =
    allInTrainMinutes.length > 0 ? Math.min(...allInTrainMinutes) : 0;
  const maxReasonableInTrainMinutes =
    minInTrainMinutes > 0
      ? Math.max(Math.round(minInTrainMinutes * 1.65), minInTrainMinutes + 360)
      : Infinity;

  // Prune combinations whose in-train travel time is an extreme geographical detour (e.g. >1.65x min in-train time)
  for (const [seqKey, g] of sequenceGroups.entries()) {
    g.combinations = g.combinations.filter((c) => {
      const inTrain = c.legs.reduce((sum, l) => sum + l.durationMinutes, 0);
      return inTrain <= maxReasonableInTrainMinutes;
    });
    if (g.combinations.length === 0) {
      sequenceGroups.delete(seqKey);
    }
  }

  // When a corridor already has >= 4 verified 2-leg (1-transfer) routes, prune redundant 3-leg
  // subdivisions (Origin -> M1 -> M2 -> Dest) that merely split an existing 2-leg route (Origin -> M1 -> Dest
  // or Origin -> M2 -> Dest) with longer duration/distance.
  const twoLegGroupsCount = Array.from(sequenceGroups.values()).filter(
    (g) => g.stationSequence.length === 3 && g.combinations.length > 0
  ).length;
  if (twoLegGroupsCount >= 4) {
    for (const [seqKey, g] of sequenceGroups.entries()) {
      if (g.stationSequence.length === 4 && g.combinations.length > 0) {
        const [orig, m1, m2, dest] = g.stationSequence;
        const twoLegViaM1 = sequenceGroups.get(`${orig}->${m1}->${dest}`);
        const twoLegViaM2 = sequenceGroups.get(`${orig}->${m2}->${dest}`);
        const best3Dur = Math.min(...g.combinations.map((c) => c.totalDurationMinutes));
        const best3Dist = Math.min(
          ...g.combinations
            .filter((c) => c.distanceReliable && c.totalDistanceKm > 0)
            .map((c) => c.totalDistanceKm)
        );

        const isDominatedBy = (twoLegGroup?: typeof g) => {
          if (!twoLegGroup || twoLegGroup.combinations.length === 0) return false;
          const best2Dur = Math.min(
            ...twoLegGroup.combinations.map((c) => c.totalDurationMinutes)
          );
          const best2Dist = Math.min(
            ...twoLegGroup.combinations
              .filter((c) => c.distanceReliable && c.totalDistanceKm > 0)
              .map((c) => c.totalDistanceKm)
          );
          return (
            best2Dur <= best3Dur + 60 &&
            (!Number.isFinite(best3Dist) ||
              (Number.isFinite(best2Dist) && best2Dist <= best3Dist + 25))
          );
        };

        if (isDominatedBy(twoLegViaM1) || isDominatedBy(twoLegViaM2)) {
          sequenceGroups.delete(seqKey);
        }
      }
    }
  }

  const shortestNetworkDist =
    reliableDistances.length > 0 ? Math.min(...reliableDistances) : 0;

  const baselineDistanceKm =
    directBaselineKm > 0 ? directBaselineKm : shortestNetworkDist;
  const baselineType =
    directBaselineKm > 0
      ? 'DIRECT_TRAIN_BASELINE'
      : 'SHORTEST_FEASIBLE_PATH_BASELINE';

  const baselineDurationMinutes =
    directOnDate.length > 0
      ? Math.min(...directOnDate.map((d) => d.durationMinutes))
      : allDurations.length > 0
      ? Math.min(...allDurations)
      : 480;

  const allCandidates: MultiRouteCandidate[] = [];

  for (const [seqKey, group] of sequenceGroups.entries()) {
    if (group.combinations.length === 0) continue;

    const scoredCombos = group.combinations.map((combo) => {
      const rec = calculateRecommendationScore({
        totalDistanceKm: combo.totalDistanceKm,
        baselineDistanceKm,
        distanceReliable: combo.distanceReliable,
        totalDurationMinutes: combo.totalDurationMinutes,
        baselineDurationMinutes,
        numberOfTransfers: combo.transfers.length,
        transfers: combo.transfers,
        legs: combo.legs,
        targetBufferMinutes,
      });
      return { ...combo, recommendation: rec };
    });

    scoredCombos.sort((a, b) => {
      // Prefer combinations where all legs have verified cumulative distances and non-slip main train numbers
      if (a.distanceReliable !== b.distanceReliable) {
        return a.distanceReliable ? -1 : 1;
      }
      if (b.recommendation.totalScore !== a.recommendation.totalScore) {
        return b.recommendation.totalScore - a.recommendation.totalScore;
      }
      if (a.totalDurationMinutes !== b.totalDurationMinutes) {
        return a.totalDurationMinutes - b.totalDurationMinutes;
      }
      const aHasSlip = a.legs.some((l) => /(?:-slip|slip)$/i.test(l.trainNumber)) ? 1 : 0;
      const bHasSlip = b.legs.some((l) => /(?:-slip|slip)$/i.test(l.trainNumber)) ? 1 : 0;
      return aHasSlip - bHasSlip;
    });

    const best = scoredCombos[0];

    const numLegs = group.stationSequence.length - 1;
    const availableTrainsByLeg: RouteLegOption[][] = Array.from(
      { length: numLegs },
      () => []
    );
    for (let l = 0; l < numLegs; l++) {
      const expectedFrom = group.stationSequence[l].toUpperCase();
      const expectedTo = group.stationSequence[l + 1].toUpperCase();
      const seenTrainNumbers = new Set<string>();
      for (const combo of scoredCombos) {
        const legOpt = combo.legs[l];
        if (
          legOpt.fromStationCode.toUpperCase() !== expectedFrom ||
          legOpt.toStationCode.toUpperCase() !== expectedTo
        ) {
          continue;
        }
        if (
          !seenTrainNumbers.has(legOpt.trainNumber) &&
          !isRedundantCoupledSlipDuplicate(legOpt, availableTrainsByLeg[l])
        ) {
          seenTrainNumbers.add(legOpt.trainNumber);
          availableTrainsByLeg[l].push(legOpt);
        }
      }
    }

    const routeDistanceInfo = calculateVerifiedRouteDistance(best.legs);

    // Compute verified distance range across all eligible verified train combinations on this route
    const verifiedComboDistances = scoredCombos
      .filter((c) => c.distanceReliable && c.totalDistanceKm > 0)
      .map((c) => Number(c.totalDistanceKm.toFixed(2)));
    const routeDistanceRange: VerifiedDistanceRange | undefined =
      verifiedComboDistances.length > 0
        ? {
            minKm: Math.min(...verifiedComboDistances),
            maxKm: Math.max(...verifiedComboDistances),
          }
        : routeDistanceInfo.verifiedDistanceRangeKm;

    const extraDistanceKm =
      routeDistanceInfo.distanceReliable && baselineDistanceKm > 0
        ? Math.max(0, routeDistanceInfo.totalDistanceKm - baselineDistanceKm)
        : 0;
    const distanceRatioPct =
      routeDistanceInfo.distanceReliable && baselineDistanceKm > 0
        ? Number(
            (
              (routeDistanceInfo.totalDistanceKm / baselineDistanceKm) *
              100
            ).toFixed(1)
          )
        : 100;
    const extraDistancePct =
      routeDistanceInfo.distanceReliable && baselineDistanceKm > 0
        ? Number(
            (
              ((routeDistanceInfo.totalDistanceKm - baselineDistanceKm) /
                baselineDistanceKm) *
              100
            ).toFixed(1)
          )
        : 0;

    const riskPriority: Record<string, number> = {
      MISSED: 4,
      HIGH_RISK: 3,
      CAUTION: 2,
      UNKNOWN: 1,
      SAFE: 0,
    };
    const worstTx = [...best.transfers].sort(
      (a, b) => riskPriority[b.riskLevel] - riskPriority[a.riskLevel]
    )[0];

    const stationNamesSequence = group.stationSequence.map((c, idx) => {
      if (idx === 0) return getStationName(c, best.legs[0].fromStationName);
      return getStationName(c, best.legs[idx - 1].toStationName);
    });

    const interchangeStations = group.stationSequence
      .slice(1, -1)
      .map((code, idx) => ({
        code,
        name: getStationName(code, best.legs[idx].toStationName),
        zone: getStationZone(code),
      }));

    const recommendationLabel = buildRouteRecommendationLabel({
      distanceReliable: routeDistanceInfo.distanceReliable,
      totalDistanceKm: routeDistanceInfo.totalDistanceKm,
      extraDistancePct,
      numberOfTransfers: numLegs - 1,
      transfers: best.transfers,
      targetBufferMinutes,
    });

    const candidateRoute: MultiRouteCandidate = {
      routeId: seqKey,
      stationSequence: group.stationSequence,
      stationNamesSequence,
      interchangeStations,
      numberOfTransfers: numLegs - 1,
      totalDistanceKm: routeDistanceInfo.totalDistanceKm,
      distanceReliable: routeDistanceInfo.distanceReliable,
      distanceVerified: routeDistanceInfo.distanceVerified,
      distanceSource: routeDistanceInfo.distanceSource,
      distanceSourceLabel: routeDistanceInfo.distanceSourceLabel,
      distanceStatusMessage: routeDistanceInfo.distanceStatusMessage,
      distanceIncompleteDetail: routeDistanceInfo.distanceIncompleteDetail,
      verifiedLegsCount: routeDistanceInfo.verifiedLegsCount,
      missingLegsCount: routeDistanceInfo.missingLegsCount,
      verifiedDistanceRangeKm: routeDistanceRange,
      recommendationLabel,
      baselineDistanceKm,
      baselineType,
      extraDistanceKm,
      distanceRatioPct,
      extraDistancePct,
      distanceCategory: routeDistanceInfo.distanceReliable
        ? classifyDistanceCategory(extraDistancePct)
        : 'Recommended alternatives',
      exceedsDefaultDetour: routeDistanceInfo.distanceReliable
        ? extraDistancePct > 25
        : false,
      selectedLegs: best.legs,
      availableTrainsByLeg,
      transfers: best.transfers,
      totalDurationMinutes: best.totalDurationMinutes,
      overallRiskStatus: worstTx.riskStatus,
      overallRiskLevel: worstTx.riskLevel,
      recommendation: best.recommendation,
      dataMode: 'SCHEDULE_ONLY',
    };

    const routeAudit = validateMultiRouteCandidate(
      candidateRoute,
      trains,
      minLayoverAllowed
    );
    if (routeAudit.valid) {
      allCandidates.push(candidateRoute);
    }
  }

  // Sort: routes with verified distance first by lowest km; then fewer transfers, highest score, shortest duration
  allCandidates.sort((a, b) => {
    const aHasDist = a.distanceReliable !== false && a.totalDistanceKm > 0;
    const bHasDist = b.distanceReliable !== false && b.totalDistanceKm > 0;
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
  });

  // Only filter out routes by maxDetourPct when the route actually has verified endpoint distances exceeding maxDetourPct.
  // Never hide valid routes whose intermediate stop distances are simply unavailable in DataMeet CC0.
  const visibleRoutes = allCandidates.filter((r) => {
    const hasDist = r.distanceReliable !== false && r.totalDistanceKm > 0;
    if (!hasDist) {
      return true;
    }
    return r.baselineDistanceKm > 0 ? r.extraDistancePct <= maxDetourPct : true;
  });
  const hiddenLongerRoutesCount = allCandidates.length - visibleRoutes.length;

  // Phase 3: Assign justified RecommendationBadgeType ("Recommended", "Lowest Distance", "Shortest Journey")
  if (visibleRoutes.length > 0) {
    const verifiedDistRoutes = visibleRoutes.filter(
      (r) => r.distanceReliable !== false && r.totalDistanceKm > 0
    );
    const minVerifiedDist =
      verifiedDistRoutes.length > 0
        ? Math.min(...verifiedDistRoutes.map((r) => r.totalDistanceKm))
        : 0;
    const minDuration = Math.min(...visibleRoutes.map((r) => r.totalDurationMinutes));
    const maxScore = Math.max(
      ...visibleRoutes.map((r) => r.recommendation.totalScore)
    );

    let assignedRecommended = false;
    for (const r of visibleRoutes) {
      const isTopScore = r.recommendation.totalScore === maxScore;
      const isLowestDist =
        minVerifiedDist > 0 &&
        r.distanceReliable !== false &&
        r.totalDistanceKm === minVerifiedDist;
      const isShortestDur = r.totalDurationMinutes === minDuration;

      if (isTopScore && !assignedRecommended) {
        r.recommendationBadge = 'Recommended';
        assignedRecommended = true;
      } else if (isLowestDist) {
        r.recommendationBadge = 'Lowest Distance';
      } else if (isShortestDur) {
        r.recommendationBadge = 'Shortest Journey';
      }
    }
  }

  // Build comprehensive route diagnostics explaining empty or partial results
  const originName = getStationName(uFrom);
  const destinationName = getStationName(uTo);
  const reasons: string[] = [];
  let diagStatus: RouteDiagnostics['status'] = 'ROUTES_FOUND';
  let diagSummary = '';

  if (trains.length === 0) {
    diagStatus = 'TIMETABLE_DATA_MISSING';
    diagSummary =
      'Insufficient timetable data: No timetable records are loaded in the local dataset.';
    reasons.push(
      'Place data/nationwide_timetable.json in the project data/ directory and restart the server.'
    );
  } else if (originEntries.length === 0) {
    diagStatus = 'NO_TRAINS_AT_ORIGIN';
    diagSummary = `Insufficient timetable coverage for ${originName} (${uFrom}): Station is in the 8,938-station directory, but has 0 commercial stopping trains in the imported timetable dataset (${trains.length.toLocaleString()} trains). Cannot claim that no service exists.`;
    reasons.push(
      `${uFrom} is not covered by commercial halts in the static DataMeet CC0 timetable snapshot; additional timetable data is required to verify services at ${uFrom}.`
    );
  } else if (destEntries.length === 0) {
    diagStatus = 'NO_TRAINS_AT_DESTINATION';
    diagSummary = `Insufficient timetable coverage for ${destinationName} (${uTo}): Station is in the 8,938-station directory, but has 0 commercial stopping trains in the imported timetable dataset (${trains.length.toLocaleString()} trains). Cannot claim that no service exists.`;
    reasons.push(
      `${uTo} is not covered by commercial halts in the static DataMeet CC0 timetable snapshot; additional timetable data is required to verify services at ${uTo}.`
    );
  } else if (
    directOnDate.length === 0 &&
    allCandidates.length === 0 &&
    directTrainsAnyDayCount > 0
  ) {
    diagStatus = 'NO_OPERATING_TRAINS_ON_DATE';
    diagSummary = `${directTrainsAnyDayCount} direct train(s) connect ${uFrom} to ${uTo}, but none operate on ${journeyDate} (${getDayOfWeekForDate(journeyDate)}).`;
    reasons.push(
      `Try selecting another day of the week when direct services between ${uFrom} and ${uTo} operate.`
    );
  } else if (visibleRoutes.length === 0 && allCandidates.length > 0) {
    diagStatus = 'NO_FEASIBLE_CONNECTIONS_WITHIN_CONSTRAINTS';
    diagSummary = `${allCandidates.length} connecting route(s) were discovered between ${uFrom} and ${uTo}, but all exceed the +${maxDetourPct}% rail detour filter.`;
    reasons.push(
      `Origin ${uFrom} has ${originEntries.length} stopping train(s); Destination ${uTo} has ${destEntries.length} stopping train(s).`,
      `Expand Max Rail Detour Limit to +100% to inspect all ${allCandidates.length} connecting route(s).`
    );
  } else if (directOnDate.length === 0 && visibleRoutes.length > 0) {
    diagStatus = 'NO_DIRECT_USE_CONNECTING';
    diagSummary =
      directTrainsAnyDayCount > 0
        ? `No direct train operates between ${originName} (${uFrom}) and ${destinationName} (${uTo}) on ${journeyDate} (${getDayOfWeekForDate(journeyDate)}), though ${directTrainsAnyDayCount} direct service(s) run on other days. Discovered ${visibleRoutes.length} verified connecting multi-train route(s) for ${journeyDate}.`
        : `No direct train found in the imported timetable between ${originName} (${uFrom}) and ${destinationName} (${uTo}) (${originEntries.length} commercial stopping trains at ${uFrom}, ${destEntries.length} at ${uTo}). Automatically discovered ${visibleRoutes.length} verified connecting multi-train route(s).`;
    reasons.push(
      `Origin ${uFrom} is served by ${originEntries.length} timetable train(s); Destination ${uTo} is served by ${destEntries.length} timetable train(s).`,
      `Top interchanges discovered: ${visibleRoutes
        .slice(0, 5)
        .map((r) => r.interchangeStations.map((ic) => ic.code).join('→'))
        .join(', ')}.`
    );
  } else if (directOnDate.length === 0 && allCandidates.length === 0) {
    diagStatus = 'NO_FEASIBLE_CONNECTIONS_WITHIN_CONSTRAINTS';
    diagSummary = `Insufficient timetable coverage or no matching connection within the ${minLayoverAllowed}m–${maxLayoverAllowed}m transfer window between ${originName} (${uFrom}) and ${destinationName} (${uTo}) in the static dataset (${trains.length.toLocaleString()} trains).`;
    reasons.push(
      `Origin ${uFrom} has ${originEntries.length} commercial stopping train(s); Destination ${uTo} has ${destEntries.length} commercial stopping train(s) in the imported snapshot.`,
      `Enable "Show tighter connections" or adjust your target transfer buffer to check shorter layovers.`
    );
  } else {
    diagStatus = 'ROUTES_FOUND';
    diagSummary = `Found ${directOnDate.length} direct train(s) and ${visibleRoutes.length} verified connecting multi-train route(s) between ${originName} (${uFrom}) and ${destinationName} (${uTo}).`;
  }

  const diagnostics: RouteDiagnostics = {
    status: diagStatus,
    originTrainsCount: originEntries.length,
    destinationTrainsCount: destEntries.length,
    directTrainsAnyDayCount,
    directTrainsOnDateCount: directOnDate.length,
    multiRoutesUnfilteredCount: allCandidates.length,
    summary: diagSummary,
    reasons,
    timetableSource: 'DataMeet Indian Railways Dataset (CC0 1.0 Public Domain)',
    totalTimetableTrains: trains.length,
  };

  return {
    originCode: uFrom,
    originName,
    destinationCode: uTo,
    destinationName,
    journeyDate,
    targetBufferMinutes,
    maxDetourPct,
    includeTighterConnections,
    baselineDistanceKm,
    baselineType,
    directTrainsCount: directOnDate.length,
    directTrains: directOnDate,
    routes: visibleRoutes,
    hiddenLongerRoutesCount,
    diagnostics,
    dataMode: 'SCHEDULE_ONLY',
    computedAtIso: new Date().toISOString(),
  };
}

/**
 * Feature 5: Re-evaluate a Multi-Route Candidate when the user selects different trains for any leg
 */
export function evaluateCustomLegSelection(params: {
  route: MultiRouteCandidate;
  selectedLegs: RouteLegOption[];
  targetBufferMinutes: number;
  liveDelayOverrides?: Record<string, number>;
}): MultiRouteCandidate {
  const {
    route,
    selectedLegs,
    targetBufferMinutes,
    liveDelayOverrides = {},
  } = params;

  const adjustedLegs: RouteLegOption[] = [];
  for (let i = 0; i < selectedLegs.length; i++) {
    const leg = { ...selectedLegs[i] };
    if (i > 0) {
      const prevLeg = adjustedLegs[i - 1];
      let candidateBoarding = prevLeg.arrivalDate;
      const arrMin = parseTimeToMinutes(prevLeg.arrivalTime);
      const depMin = parseTimeToMinutes(leg.departureTime);
      if (depMin < arrMin) {
        candidateBoarding = addDaysToDateString(prevLeg.arrivalDate, 1);
      }
      const dayShift = diffDaysBetweenDates(
        leg.boardingDate,
        candidateBoarding
      );
      if (dayShift !== 0) {
        leg.boardingDate = candidateBoarding;
        leg.arrivalDate = addDaysToDateString(leg.arrivalDate, dayShift);
      }
    }
    adjustedLegs.push(leg);
  }

  const transfers: TransferEvaluation[] = [];
  for (let i = 0; i < adjustedLegs.length - 1; i++) {
    const inc = adjustedLegs[i];
    const out = adjustedLegs[i + 1];
    const icStation = route.interchangeStations[i];
    const overrideDelay = liveDelayOverrides[inc.trainNumber];
    transfers.push(
      evaluateTransferConnection({
        interchangeStationCode: icStation.code,
        interchangeStationName: icStation.name,
        interchangeZone: icStation.zone,
        incomingLeg: inc,
        outgoingLeg: out,
        userTargetBufferMinutes: targetBufferMinutes,
        liveIncomingDelayOverride: overrideDelay,
      })
    );
  }

  const routeDistanceInfo = calculateVerifiedRouteDistance(adjustedLegs);
  const {
    totalDistanceKm,
    distanceReliable,
    distanceVerified,
    distanceSource,
    distanceSourceLabel,
    distanceStatusMessage,
    distanceIncompleteDetail,
    verifiedLegsCount,
    missingLegsCount,
    verifiedDistanceRangeKm,
  } = routeDistanceInfo;

  const extraDistanceKm =
    distanceReliable && route.baselineDistanceKm > 0
      ? Math.max(0, totalDistanceKm - route.baselineDistanceKm)
      : 0;
  const distanceRatioPct =
    distanceReliable && route.baselineDistanceKm > 0
      ? Number(((totalDistanceKm / route.baselineDistanceKm) * 100).toFixed(1))
      : 100;
  const extraDistancePct =
    distanceReliable && route.baselineDistanceKm > 0
      ? Number(
          (
            ((totalDistanceKm - route.baselineDistanceKm) /
              route.baselineDistanceKm) *
            100
          ).toFixed(1)
        )
      : 0;

  const totalDurationMinutes =
    adjustedLegs.reduce((sum, l) => sum + l.durationMinutes, 0) +
    transfers.reduce((sum, t) => sum + t.scheduledLayoverMinutes, 0);

  const recommendation = calculateRecommendationScore({
    totalDistanceKm,
    baselineDistanceKm: route.baselineDistanceKm,
    distanceReliable,
    totalDurationMinutes,
    baselineDurationMinutes:
      route.baselineDistanceKm > 0
        ? Math.max(240, Math.round((route.baselineDistanceKm / 55) * 60))
        : Math.max(240, route.totalDurationMinutes),
    numberOfTransfers: transfers.length,
    transfers,
    legs: adjustedLegs,
    targetBufferMinutes,
  });

  const recommendationLabel = buildRouteRecommendationLabel({
    distanceReliable,
    totalDistanceKm,
    extraDistancePct,
    numberOfTransfers: transfers.length,
    transfers,
    targetBufferMinutes,
  });

  const riskPriority: Record<string, number> = {
    MISSED: 4,
    HIGH_RISK: 3,
    CAUTION: 2,
    UNKNOWN: 1,
    SAFE: 0,
  };
  const worstTx = [...transfers].sort(
    (a, b) => riskPriority[b.riskLevel] - riskPriority[a.riskLevel]
  )[0];

  return {
    ...route,
    totalDistanceKm,
    distanceReliable,
    distanceVerified,
    distanceSource,
    distanceSourceLabel,
    distanceStatusMessage,
    distanceIncompleteDetail,
    verifiedLegsCount,
    missingLegsCount,
    verifiedDistanceRangeKm,
    recommendationLabel,
    extraDistanceKm,
    distanceRatioPct,
    extraDistancePct,
    distanceCategory: distanceReliable
      ? classifyDistanceCategory(extraDistancePct)
      : 'Recommended alternatives',
    exceedsDefaultDetour: distanceReliable ? extraDistancePct > 25 : false,
    totalDurationMinutes,
    selectedLegs: adjustedLegs,
    transfers,
    overallRiskStatus: worstTx.riskStatus,
    overallRiskLevel: worstTx.riskLevel,
    recommendation,
  };
}

/**
 * Feature 6: Live Train Status / Timetable Inspector
 */
export function getLiveTrainStatus(
  trainNumber: string,
  journeyDate: string,
  customDelayMinutes?: number,
  trains: TrainService[] = TRAIN_SERVICES
): LiveTrainStatus | null {
  const cleanNum = trainNumber.trim();
  const graph = getRouteGraph(trains);
  const train =
    graph.trainByNumber.get(cleanNum) ||
    trains.find(
      (t) =>
        t.trainNumber === cleanNum ||
        t.trainName.toLowerCase().includes(cleanNum.toLowerCase())
    );
  if (!train) return null;

  const isManualWhatIf =
    customDelayMinutes !== undefined && customDelayMinutes > 0;
  const delay =
    customDelayMinutes !== undefined
      ? Math.max(0, Math.round(customDelayMinutes))
      : 0;

  const events: LiveStationEvent[] = train.stops.map((stop) => {
    const expArr = stop.arrivalTime
      ? formatMinutesToTime(parseTimeToMinutes(stop.arrivalTime) + delay)
      : null;
    const expDep = stop.departureTime
      ? formatMinutesToTime(parseTimeToMinutes(stop.departureTime) + delay)
      : null;

    return {
      stationCode: stop.stationCode,
      stationName: stop.stationName,
      stopSequence: stop.stopSequence,
      dayOffset: stop.dayOffset,
      distanceKm: stop.distanceKm >= 0 ? stop.distanceKm : 0,
      platform: stop.platform || '—',
      scheduledArrival: stop.arrivalTime,
      scheduledDeparture: stop.departureTime,
      expectedArrival: isManualWhatIf ? expArr : stop.arrivalTime,
      expectedDeparture: isManualWhatIf ? expDep : stop.departureTime,
      delayMinutes: delay,
      status: 'UPCOMING',
    };
  });

  const firstStop = train.stops[0];
  const lastStop = train.stops[train.stops.length - 1];

  return {
    trainNumber: train.trainNumber,
    trainName: train.trainName,
    trainType: train.trainType,
    journeyDate,
    currentStationCode: firstStop.stationCode,
    currentStationName: firstStop.stationName,
    nextStationCode: lastStop.stationCode,
    nextStationName: lastStop.stationName,
    currentDelayMinutes: delay,
    runningState: isManualWhatIf ? 'RUNNING_DELAYED' : 'NOT_STARTED',
    statusNote: isManualWhatIf
      ? `Manual What-If Delay Calculator: +${delay}m applied to scheduled timetable`
      : 'Live GPS/NTES running status unavailable (₹0 API Budget Mode) — showing scheduled timetable',
    lastUpdatedIso: new Date().toISOString(),
    dataMode: isManualWhatIf ? 'DEMO_SIMULATION' : 'SCHEDULE_ONLY',
    sourceProvider:
      train.source ||
      'Local Timetable Dataset (₹0 Offline Mode — No Live API Configured)',
    isStale: false,
    events,
  };
}

/**
 * Feature 7: Two-Train Connection Comparison Engine
 */
export function compareTwoTrainsLive(params: {
  incomingTrainNumber: string;
  outgoingTrainNumber: string;
  journeyDate: string;
  connectingStationCode?: string;
  incomingDelayOverride?: number;
  outgoingDelayOverride?: number;
  targetBufferMinutes?: number;
  trains?: TrainService[];
}): TwoTrainComparisonResult | null {
  const {
    incomingTrainNumber,
    outgoingTrainNumber,
    journeyDate,
    connectingStationCode,
    incomingDelayOverride,
    outgoingDelayOverride,
    targetBufferMinutes = 180,
    trains = TRAIN_SERVICES,
  } = params;

  const graph = getRouteGraph(trains);
  const incService =
    graph.trainByNumber.get(incomingTrainNumber.trim()) ||
    trains.find((t) => t.trainNumber === incomingTrainNumber.trim());
  const outService =
    graph.trainByNumber.get(outgoingTrainNumber.trim()) ||
    trains.find((t) => t.trainNumber === outgoingTrainNumber.trim());
  if (!incService || !outService) return null;

  const outCodes = new Set(
    outService.stops.slice(0, -1).map((s) => s.stationCode.toUpperCase())
  );
  const commonStations = incService.stops
    .slice(1)
    .filter((s) => outCodes.has(s.stationCode.toUpperCase()))
    .map((s) => ({ code: s.stationCode, name: s.stationName }));

  const selectedCode =
    connectingStationCode &&
    commonStations.some((c) => c.code === connectingStationCode)
      ? connectingStationCode
      : commonStations[0]?.code ||
        incService.stops[incService.stops.length - 1].stationCode;

  const incStop =
    incService.stops.find((s) => s.stationCode === selectedCode) ||
    incService.stops[incService.stops.length - 1];
  const outStop =
    outService.stops.find((s) => s.stationCode === selectedCode) ||
    outService.stops[0];

  const incLive = getLiveTrainStatus(
    incService.trainNumber,
    journeyDate,
    incomingDelayOverride,
    trains
  )!;
  const outLive = getLiveTrainStatus(
    outService.trainNumber,
    journeyDate,
    outgoingDelayOverride,
    trains
  )!;

  const schedArrStr = incStop.arrivalTime || incStop.departureTime || '12:00';
  const schedDepStr = outStop.departureTime || outStop.arrivalTime || '15:00';

  const schedArrMin = parseTimeToMinutes(schedArrStr);
  const schedDepMin = parseTimeToMinutes(schedDepStr);
  const scheduledLayoverMinutes =
    schedDepMin >= schedArrMin
      ? schedDepMin - schedArrMin
      : 1440 - schedArrMin + schedDepMin;

  const incDelay = incLive.currentDelayMinutes;
  const outDelay = outLive.currentDelayMinutes;
  const isManualWhatIf =
    (incomingDelayOverride !== undefined && incomingDelayOverride > 0) ||
    (outgoingDelayOverride !== undefined && outgoingDelayOverride > 0);

  const projectedArrivalTime = formatMinutesToTime(schedArrMin + incDelay);
  const projectedDepartureTime = formatMinutesToTime(schedDepMin + outDelay);

  const remainingTransferMinutes = scheduledLayoverMinutes - incDelay + outDelay;
  const platformTransferMarginMinutes = 15;
  const histStats = getHistoricalDelayForTrainAtStation(incService, selectedCode);

  let comparisonStatus: TwoTrainComparisonResult['comparisonStatus'] =
    'Connection still comfortable';
  let riskLevel: TwoTrainComparisonResult['riskLevel'] = 'SAFE';
  let explanation = '';

  if (remainingTransferMinutes < platformTransferMarginMinutes) {
    comparisonStatus = 'Likely missed connection';
    riskLevel = 'MISSED';
    explanation = `With +${incDelay}m delay on ${incService.trainNumber} (projected arrival ${projectedArrivalTime}), only ${remainingTransferMinutes}m remains before ${outService.trainNumber} departs at ${projectedDepartureTime}. Minimum 15m platform change required.`;
  } else if (remainingTransferMinutes < 60) {
    comparisonStatus = 'High risk';
    riskLevel = 'HIGH_RISK';
    explanation = `Only ${formatDuration(remainingTransferMinutes)} transfer margin remains at ${selectedCode}. Any further delay to ${incService.trainNumber} risks missing ${outService.trainNumber}.`;
  } else if (remainingTransferMinutes < targetBufferMinutes || incDelay >= 30) {
    comparisonStatus = 'Buffer decreasing';
    riskLevel = 'CAUTION';
    explanation = `Scheduled layover of ${formatDuration(scheduledLayoverMinutes)} reduces to ${formatDuration(remainingTransferMinutes)} under +${incDelay}m delay on ${incService.trainNumber}.`;
  } else {
    comparisonStatus = 'Connection still comfortable';
    riskLevel = histStats.available || isManualWhatIf ? 'SAFE' : 'UNKNOWN';
    explanation = isManualWhatIf
      ? `${formatDuration(remainingTransferMinutes)} transfer buffer remains at ${selectedCode} under +${incDelay}m manual what-if delay. Exceeds target safety margin.`
      : `Scheduled timetable layover is ${formatDuration(scheduledLayoverMinutes)} at ${selectedCode} (Live GPS/NTES status and historical delay data unavailable in ₹0 budget mode; use the slider below to stress-test delays).`;
  }

  return {
    incomingTrain: incLive,
    outgoingTrain: outLive,
    connectingStationCode: selectedCode,
    connectingStationName: incStop.stationName,
    commonStations,
    scheduledArrivalTime: schedArrStr,
    scheduledDepartureTime: schedDepStr,
    scheduledLayoverMinutes,
    incomingDelayMinutes: incDelay,
    outgoingDelayMinutes: outDelay,
    projectedArrivalTime,
    projectedDepartureTime,
    remainingTransferMinutes,
    platformTransferMarginMinutes,
    incomingPlatform: incStop.platform || '—',
    outgoingPlatform: outStop.platform || '—',
    historicalStatsAtConnection: histStats,
    comparisonStatus,
    riskLevel,
    explanation,
    lastUpdatedIso: new Date().toISOString(),
    dataMode: isManualWhatIf ? 'DEMO_SIMULATION' : 'SCHEDULE_ONLY',
  };
}
