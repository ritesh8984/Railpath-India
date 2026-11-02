import fs from 'node:fs';
import path from 'node:path';
import { DayOfWeek, HistoricalDelayStats, NormalizedStation, TrainService, TrainStop } from '../types/railway';

export function makeUnavailableDelayStats(
  trainNumber: string,
  stationCode: string
): HistoricalDelayStats {
  return {
    trainNumber,
    stationCode,
    available: false,
    sampleCount: 0,
    windowDays: 30,
    medianDelayMinutes: 0,
    p90DelayMinutes: 0,
    delayedOver15MinPct: 0,
    delayedOver30MinPct: 0,
    delayedOver60MinPct: 0,
    lastObservedDate: 'N/A',
    source: 'UNAVAILABLE',
  };
}

const ALL_DAYS: DayOfWeek[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export interface CompactTimetableStop {
  c: string; // stationCode
  a: string | null; // arrivalTime HH:MM
  d: string | null; // departureTime HH:MM
  day: number; // dayOffset
  km?: number | string | null; // distanceKm when available
  distanceKm?: number | string | null;
  distance_from_origin?: number | string | null;
  source_distance?: number | string | null;
}

export interface CompactTimetableTrain {
  n: string; // trainNumber
  name: string; // trainName
  t: string; // trainType code
  dist: number | null;
  cls?: string[];
  s: CompactTimetableStop[];
}

export interface NationwideTimetablePayload {
  source: string;
  license: string;
  freshness: string;
  operatingDaysAvailable: boolean;
  perStopDistanceAvailable?: boolean;
  trainsCount: number;
  trains: CompactTimetableTrain[];
}

export interface VerifiedTrainDistanceRecord {
  dir: string;
  status: 'VERIFIED_COMPLETE' | 'VERIFIED_PARTIAL' | 'ENDPOINT_ONLY' | 'UNVERIFIED';
  src: string;
  overallKm: number | null;
  km: Array<number | null>;
}

export interface VerifiedStopDistancesPayload {
  datasetName: string;
  datasetVersion: string;
  snapshotDate: string;
  importTimestamp: string;
  source: string;
  license: string;
  totalTrainsEvaluated: number;
  verifiedCompleteTrainsCount: number;
  verifiedPartialTrainsCount: number;
  endpointOnlyTrainsCount: number;
  unverifiedTrainsCount: number;
  totalStopsEvaluated: number;
  verifiedStopsCount: number;
  verifiedIntermediateStopsCount: number;
  verifiedStopCoveragePct: number;
  trains: Record<string, VerifiedTrainDistanceRecord>;
}

let cachedVerifiedStopDistances: VerifiedStopDistancesPayload | null | undefined;

/**
 * Loads the normalized per-stop cumulative distance dataset (`data/verified_stop_distances.json`)
 * generated from the Government of India Open Data (`data.gov.in`) Ministry of Railways timetable
 * (`raildb.sqlite`, MIT License / GODL-India) + DataMeet CC0 timetable.
 */
export function loadVerifiedStopDistancesDataset(): VerifiedStopDistancesPayload | null {
  if (cachedVerifiedStopDistances !== undefined) {
    return cachedVerifiedStopDistances;
  }
  try {
    if (typeof process !== 'undefined' && process.cwd) {
      const absPath = path.resolve(process.cwd(), 'data', 'verified_stop_distances.json');
      if (fs.existsSync(absPath)) {
        const raw = fs.readFileSync(absPath, 'utf8');
        const parsed = JSON.parse(raw) as VerifiedStopDistancesPayload;
        if (parsed && parsed.trains && typeof parsed.trains === 'object') {
          cachedVerifiedStopDistances = parsed;
          return parsed;
        }
      }
    }
  } catch {
    // Fallback gracefully if fs is unavailable in browser context
  }
  cachedVerifiedStopDistances = null;
  return null;
}

function mapTrainType(rawType: string): TrainService['trainType'] {
  const u = (rawType || '').toUpperCase();
  if (u.includes('RAJ')) return 'RAJDHANI';
  if (u.includes('VANDE')) return 'VANDE_BHARAT';
  if (u.includes('SHT') || u.includes('SHAT')) return 'SHATABDI';
  if (u.includes('GARIB') || u === 'GR') return 'GARIB_RATH';
  if (u.includes('SF') || u.includes('SUPER')) return 'SUPERFAST';
  if (u.includes('INT')) return 'INTERCITY';
  if (u.includes('SPL') || u.includes('SPEC')) return 'SPECIAL';
  if (u.includes('MAIL')) return 'MAIL_EXPRESS';
  return 'EXPRESS';
}

function parseHHMMToMin(hhmm: string | null): number {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

/**
 * Extracts a verified cumulative stop distance in kilometres from any supported field
 * (`km`, `distanceKm`, `distance_from_origin`, `source_distance`), returning -1 if missing or invalid.
 */
export function extractStopCumulativeKm(stop: CompactTimetableStop): number {
  const candidates = [
    stop.km,
    stop.distanceKm,
    stop.distance_from_origin,
    stop.source_distance,
  ];
  for (const val of candidates) {
    if (typeof val === 'number' && Number.isFinite(val) && val >= 0) {
      return Number(val.toFixed(2));
    }
    if (typeof val === 'string' && val.trim() !== '') {
      const cleaned = val.trim().replace(/\s*km$/i, '');
      const parsed = Number(cleaned);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return Number(parsed.toFixed(2));
      }
    }
  }
  return -1;
}

/**
 * Converts the normalized nationwide timetable JSON payload into TrainService[] records,
 * enriching station names from the validated 8,938-station Railway_stations.json directory
 * and merging verified per-stop cumulative distances from `data/verified_stop_distances.json`.
 *
 * STRICT VALIDATION RULES:
 * 1. No hardcoded, mock, or synthetic trains are merged.
 * 2. Every intermediate stop must be a genuine commercial passenger halt (arrival !== departure).
 *    Any train containing a 0-minute non-stop passing row or consecutive duplicate stop is rejected.
 * 3. Per-stop distances are never interpolated with Haversine; stop.distanceKm is set to the verified
 *    cumulative value (>= 0) when present and strictly monotonic in the train's stop sequence, or -1 when unavailable.
 * 4. If a train's overall distance (`dist`) conflicts with its final stop's cumulative distance,
 *    its stop distances are quarantined (-1).
 * 5. Historical delay stats are empty ({}) so synthetic punctuality metrics are never fabricated.
 */
export function buildNationwideTrainServices(
  payload: NationwideTimetablePayload | null,
  stationsDirectory: NormalizedStation[] = [],
  verifiedDistancesOverride?: VerifiedStopDistancesPayload | null
): TrainService[] {
  if (!payload || !Array.isArray(payload.trains)) {
    return [];
  }

  const verifiedDistDataset =
    verifiedDistancesOverride !== undefined
      ? verifiedDistancesOverride
      : loadVerifiedStopDistancesDataset();

  const stationNameByCode = new Map<string, string>();
  for (const st of stationsDirectory) {
    stationNameByCode.set(st.code.toUpperCase(), st.displayName || st.name);
  }

  const byTrainNumber = new Map<string, TrainService>();

  for (const ct of payload.trains) {
    if (!ct.n || !ct.name || !Array.isArray(ct.s) || ct.s.length < 2) continue;
    if (byTrainNumber.has(ct.n)) continue;

    // Validate stop sequence integrity: commercial halts only, no consecutive duplicate stop codes
    let validStopSequence = true;

    for (let idx = 0; idx < ct.s.length; idx++) {
      const stop = ct.s[idx];
      const code = (stop.c || '').trim().toUpperCase();
      const prevCode = idx > 0 ? (ct.s[idx - 1].c || '').trim().toUpperCase() : '';
      if (!code || (idx > 0 && code === prevCode)) {
        validStopSequence = false;
        break;
      }

      if (idx === 0) {
        if (!stop.d) {
          validStopSequence = false;
          break;
        }
      } else if (idx === ct.s.length - 1) {
        if (!stop.a) {
          validStopSequence = false;
          break;
        }
      } else {
        // Intermediate stop MUST have both arrival and departure, and arrival !== departure (commercial halt)
        if (!stop.a || !stop.d || stop.a === stop.d) {
          validStopSequence = false;
          break;
        }
      }
    }

    if (!validStopSequence) continue;

    // Check if verified per-stop distance record matches this train's exact stop count & direction
    const firstCode = (ct.s[0].c || '').trim().toUpperCase();
    const lastCode = (ct.s[ct.s.length - 1].c || '').trim().toUpperCase();
    const expectedDir = `${firstCode}->${lastCode}`;
    const extRecord = verifiedDistDataset?.trains?.[ct.n];
    const useExtRecord =
      extRecord &&
      extRecord.dir === expectedDir &&
      Array.isArray(extRecord.km) &&
      extRecord.km.length === ct.s.length;

    // Extract cumulative stop distances: inline stop km takes precedence; fallback to verified_stop_distances.json
    const extractedKms = ct.s.map((stop, idx) => {
      const inlineKm = extractStopCumulativeKm(stop);
      if (inlineKm >= 0) return inlineKm;
      if (useExtRecord) {
        const extKm = extRecord.km[idx];
        if (typeof extKm === 'number' && Number.isFinite(extKm) && extKm >= 0) {
          return Number(extKm.toFixed(2));
        }
      }
      return -1;
    });

    // Verify strict monotonicity across all recorded stop distances
    let monotonicDistanceSeq = true;
    let lastRecordedKm = -1;
    for (let idx = 0; idx < extractedKms.length; idx++) {
      const kmVal = extractedKms[idx];
      if (kmVal >= 0) {
        if (lastRecordedKm >= 0 && kmVal <= lastRecordedKm) {
          monotonicDistanceSeq = false;
          break;
        }
        lastRecordedKm = kmVal;
      }
    }

    // Verify consistency between train-level overall distance (`ct.dist`) and final cumulative stop distance
    const finalStopKm = extractedKms[extractedKms.length - 1];
    if (
      monotonicDistanceSeq &&
      typeof ct.dist === 'number' &&
      Number.isFinite(ct.dist) &&
      ct.dist > 0 &&
      finalStopKm >= 0
    ) {
      const diff = Math.abs(ct.dist - finalStopKm);
      if (diff > Math.max(15, ct.dist * 0.05)) {
        monotonicDistanceSeq = false;
      }
    }

    const validatedKms = monotonicDistanceSeq
      ? extractedKms
      : extractedKms.map(() => -1);

    // Filter out non-commercial Shoranur 'B' Cabin triangular bypass-chord locomotive-reversal entries:
    // Through trains running directly between the Palakkad branch (CBE, PGT, OTP) and the Thrissur branch
    // (WKI, TCR, AWY, ERS, ERN) take the Shoranur triangular bypass chord and do not make a commercial
    // passenger halt inside Shoranur Junction (SRR), even though legacy DataMeet archives recorded a
    // 15-minute operational reversal row at SRR.
    const PALAKKAD_BRANCH_CODES = new Set(['CBE', 'PGT', 'OTP']);
    const THRISSUR_BRANCH_CODES = new Set(['WKI', 'TCR', 'AWY', 'ERS', 'ERN']);

    const commercialStopEntries: Array<{ rawStop: CompactTimetableStop; rawIdx: number; km: number }> = [];
    for (let idx = 0; idx < ct.s.length; idx++) {
      const stop = ct.s[idx];
      const code = (stop.c || '').trim().toUpperCase();
      if (idx > 0 && idx < ct.s.length - 1 && code === 'SRR') {
        const prevCode = (ct.s[idx - 1].c || '').trim().toUpperCase();
        const nextCode = (ct.s[idx + 1].c || '').trim().toUpperCase();
        const isBypassChordThroughTrain =
          (PALAKKAD_BRANCH_CODES.has(prevCode) && THRISSUR_BRANCH_CODES.has(nextCode)) ||
          (THRISSUR_BRANCH_CODES.has(prevCode) && PALAKKAD_BRANCH_CODES.has(nextCode));
        if (isBypassChordThroughTrain) {
          continue;
        }
      }
      commercialStopEntries.push({
        rawStop: stop,
        rawIdx: idx,
        km: validatedKms[idx],
      });
    }

    if (commercialStopEntries.length < 2) continue;

    const allStopsHaveVerifiedKm = commercialStopEntries.every(
      (entry, idx) =>
        entry.km >= 0 && (idx === 0 || entry.km > commercialStopEntries[idx - 1].km)
    );

    const stops: TrainStop[] = commercialStopEntries.map((entry, idx) => {
      const stop = entry.rawStop;
      const code = stop.c.trim().toUpperCase();
      const arr = idx === 0 ? null : stop.a;
      const dep = idx === commercialStopEntries.length - 1 ? null : stop.d;
      let haltMinutes = 0;
      if (arr && dep) {
        const diff = parseHHMMToMin(dep) - parseHHMMToMin(arr);
        haltMinutes = diff >= 0 ? diff : diff + 1440;
      }
      return {
        stationCode: code,
        stationName: stationNameByCode.get(code) || code,
        stopSequence: idx + 1,
        arrivalTime: arr,
        departureTime: dep,
        haltMinutes,
        dayOffset: Math.max(1, stop.day || 1),
        distanceKm: entry.km,
      };
    });

    byTrainNumber.set(ct.n, {
      trainNumber: ct.n,
      trainName: ct.name,
      trainType: mapTrainType(ct.t),
      operatingDays: ALL_DAYS,
      operatingDaysAvailable: Boolean(payload.operatingDaysAvailable),
      distanceReliable: allStopsHaveVerifiedKm,
      source:
        useExtRecord && extRecord.src === 'OGD_INDIA_MINISTRY_OF_RAILWAYS_TIMETABLE'
          ? 'OGD India Ministry of Railways Timetable (GODL-India / MIT) + DataMeet CC0'
          : payload.source || 'DataMeet Indian Railways Dataset (CC0 1.0)',
      freshness: payload.freshness || 'Static Community Timetable Snapshot (DataMeet CC0)',
      originCode: stops[0].stationCode,
      destinationCode: stops[stops.length - 1].stationCode,
      classes: ct.cls && ct.cls.length > 0 ? ct.cls : ['SL', '2S'],
      stops,
      historicalDelaysByStation: {},
      defaultDemoDelayMinutes: 0,
      defaultCurrentStationCode: stops[0].stationCode,
    });
  }

  return Array.from(byTrainNumber.values());
}

/**
 * Empty default array — all train services must be loaded from verified imported timetable data
 * (data/nationwide_timetable.json) rather than hardcoded mock or sample corridors.
 */
export const TRAIN_SERVICES: TrainService[] = [];
