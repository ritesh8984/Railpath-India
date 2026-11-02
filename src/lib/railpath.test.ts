import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  areStationsStrictlyIdentical,
  auditStationsDataset,
  getStationByCode,
  normalizeStationsDataset,
  searchStations,
} from './stationSearch';
import {
  buildRouteLegOption,
  calculateLegDurationMinutes,
  calculateVerifiedLegDistance,
  calculateVerifiedRouteDistance,
  compareTwoTrainsLive,
  doesTrainOperateAtStopOnDate,
  evaluateCustomLegSelection,
  evaluateTransferConnection,
  findDirectTrains,
  findMultiRoutes,
  getLiveTrainStatus,
  getRouteGraph,
  isCommercialTrainStop,
  isValidJourneyDate,
  MISSING_TOTAL_DISTANCE_MESSAGE,
  validateMultiRouteCandidate,
  validateTrainLegWithReason,
  verifyTrainLegAgainstTimetable,
} from './routingEngine';
import {
  buildNationwideTrainServices,
  NationwideTimetablePayload,
  TRAIN_SERVICES,
} from '../data/railwayDataset';
import { RawStationRecord, TrainService } from '../types/railway';

const rawJsonPath = path.resolve(process.cwd(), 'data/Railway_stations.json');
const rawRecords: RawStationRecord[] = JSON.parse(fs.readFileSync(rawJsonPath, 'utf8'));
const normalizedStations = normalizeStationsDataset(rawRecords);

const timetableJsonPath = path.resolve(process.cwd(), 'data/nationwide_timetable.json');
const nationwidePayload: NationwideTimetablePayload = JSON.parse(
  fs.readFileSync(timetableJsonPath, 'utf8')
);
const nationwideTrains = buildNationwideTrainServices(
  nationwidePayload,
  normalizedStations
);
const nationwideGraph = getRouteGraph(nationwideTrains);

test('1. Station dataset audit validates all 8,938 records with zero duplicates or missing fields', () => {
  const report = auditStationsDataset(rawRecords, 'data/Railway_stations.json');
  assert.equal(report.totalRecords, 8938);
  assert.equal(report.uniqueCodes, 8938);
  assert.equal(report.duplicateCodes.length, 0);
  assert.equal(report.missingCodeCount, 0);
  assert.equal(report.missingNameCount, 0);
  assert.equal(report.missingZoneCount, 0);
  assert.equal(report.status, 'VALIDATED');
  assert.ok(report.zoneDistribution['SER'] > 300);
  assert.ok(report.zoneDistribution['NR'] > 1000);
});

test('2. Station autocomplete supports code, name, city alias, Hindi/Devanagari, and typo tolerance (including ROP, ROU, BSB)', () => {
  const rouMatches = searchStations(normalizedStations, 'ROU', 5);
  assert.equal(rouMatches[0].code, 'ROU');
  assert.equal(rouMatches[0].zone, 'SER');

  const ropMatches = searchStations(normalizedStations, 'ROP', 5);
  assert.equal(ropMatches[0].code, 'ROP');
  assert.ok(ropMatches[0].displayName.toLowerCase().includes('rupsa'));

  const banarasMatches = searchStations(normalizedStations, 'banaras', 5);
  assert.ok(banarasMatches.some((s) => s.code === 'BSB' || s.code === 'BSBS'));

  const mgsMatches = searchStations(normalizedStations, 'mughalsarai', 5);
  assert.equal(mgsMatches[0].code, 'DDU');

  const jsrMatches = searchStations(normalizedStations, 'jamshedpur', 5);
  assert.equal(jsrMatches[0].code, 'TATA');

  const hindiMatches = searchStations(normalizedStations, 'राउरकेला', 5);
  assert.equal(hindiMatches[0].code, 'ROU');

  const typoMatches = searchStations(normalizedStations, 'rourkla', 5);
  assert.ok(typoMatches.some((s) => s.code === 'ROU'));
});

test('3. Mock or hardcoded train records never appear in verified search results', () => {
  // Default TRAIN_SERVICES must be empty so no hardcoded mock trains exist
  assert.equal(
    TRAIN_SERVICES.length,
    0,
    'TRAIN_SERVICES must be empty; all trains must come from imported timetable dataset'
  );

  // Verify previously hardcoded non-DataMeet trains (e.g. 20887, 08152, 18523) are absent
  for (const hardcodedNum of ['20887', '08152', '18523']) {
    assert.equal(
      nationwideGraph.trainByNumber.has(hardcodedNum),
      false,
      `Hardcoded train ${hardcodedNum} should not exist in DataMeet dataset`
    );
  }

  // Verify 18105 is the genuine DataMeet train (ROU -> BBS InterCity), not the synthetic ROU -> DHN override
  const train18105 = nationwideGraph.trainByNumber.get('18105');
  assert.ok(train18105, 'Train 18105 should exist in DataMeet timetable');
  assert.equal(train18105.originCode, 'ROU');
  assert.equal(train18105.destinationCode, 'BBS');

  // Verify every loaded train has 0 fabricated historical delay records and commercial halts only
  assert.equal(nationwideTrains.length, 5058);
  for (const train of nationwideTrains) {
    assert.equal(
      Object.keys(train.historicalDelaysByStation || {}).length,
      0,
      `Train ${train.trainNumber} must not have fabricated historical delay records`
    );
    for (let i = 0; i < train.stops.length; i++) {
      assert.equal(
        isCommercialTrainStop(train, i),
        true,
        `Stop ${train.stops[i].stationCode} at index ${i} of train ${train.trainNumber} must be a commercial halt`
      );
    }
  }
});

test('4. A train cannot serve a destination that does not appear later in its verified stop sequence or a non-stop passing station', () => {
  // Train 18311 runs SBP -> JSG -> ROU -> ... -> BSB in DataMeet
  const directForward = findDirectTrains('ROU', 'BSB', '2026-10-29', nationwideTrains);
  assert.ok(directForward.some((t) => t.trainNumber === '18311'));
  for (const match of directForward) {
    assert.equal(verifyTrainLegAgainstTimetable(match, nationwideTrains), true);
  }

  // Reverse order (BSB -> ROU on 18311) must NOT match 18311
  const directReverse = findDirectTrains('BSB', 'ROU', '2026-10-29', nationwideTrains);
  assert.equal(
    directReverse.some((t) => t.trainNumber === '18311'),
    false,
    'Train 18311 cannot serve ROU after BSB because ROU appears before BSB in its stop sequence'
  );

  // Train 12281 (Bhubaneswar - New Delhi Duronto) only stops commercially at BBS and NDLS;
  // it passes ROP, GMO, and PRP non-stop (0m halt in raw DataMeet schedules) and must NOT serve them
  const train12281 = nationwideGraph.trainByNumber.get('12281');
  assert.ok(train12281, 'Train 12281 exists in DataMeet');
  assert.deepEqual(
    train12281.stops.map((s) => s.stationCode),
    ['BBS', 'NDLS'],
    'Train 12281 must only contain its verified commercial halts (BBS -> NDLS)'
  );
  assert.equal(findDirectTrains('ROP', 'PRP', '2026-10-29', nationwideTrains).length, 0);
  assert.equal(findDirectTrains('ROP', 'GMO', '2026-10-29', nationwideTrains).length, 0);

  // Also test that a synthetic non-stop passing row (arrival === departure) is rejected by buildNationwideTrainServices and verifyTrainLegAgainstTimetable
  const syntheticPayload: NationwideTimetablePayload = {
    source: 'Test Payload',
    license: 'CC0',
    freshness: 'Test',
    operatingDaysAvailable: false,
    trainsCount: 1,
    trains: [
      {
        n: '99999',
        name: 'Test Non-Stop Passing Train',
        t: 'SF',
        dist: 500,
        s: [
          { c: 'ROP', a: null, d: '10:00', day: 1, km: 0 },
          { c: 'PRP', a: '14:00', d: '14:00', day: 1, km: null }, // 0-minute passing row!
          { c: 'NDLS', a: '20:00', d: null, day: 1, km: 500 },
        ],
      },
    ],
  };
  const builtFromInvalid = buildNationwideTrainServices(syntheticPayload, normalizedStations);
  assert.equal(
    builtFromInvalid.length,
    0,
    'Trains with 0-minute intermediate passing stops (a === d) must be rejected'
  );
});

test('5. Two legs with incompatible dates or timings cannot be combined, and connections failing transfer-buffer requirements are rejected', () => {
  // Leg 1: 18008 ROP (14:30) -> KGP (16:00) on 2026-10-29
  const train18008 = nationwideGraph.trainByNumber.get('18008')!;
  const ropIdx = train18008.stops.findIndex((s) => s.stationCode === 'ROP');
  const kgpIdx1 = train18008.stops.findIndex((s) => s.stationCode === 'KGP');
  const leg1 = buildRouteLegOption(
    0,
    train18008,
    train18008.stops[ropIdx],
    train18008.stops[kgpIdx1],
    '2026-10-29',
    ropIdx,
    kgpIdx1
  );

  // Incompatible Leg 2: 08043 KGP -> BSB scheduled on an earlier date (2026-10-28) before leg1 arrives on 2026-10-29!
  const train08043 = nationwideGraph.trainByNumber.get('08043')!;
  const kgpIdx2 = train08043.stops.findIndex((s) => s.stationCode === 'KGP');
  const bsbIdx2 = train08043.stops.findIndex((s) => s.stationCode === 'BSB');

  const incompatibleEarlierDateLeg = buildRouteLegOption(
    1,
    train08043,
    train08043.stops[kgpIdx2],
    train08043.stops[bsbIdx2],
    '2026-10-28', // Day before leg1 arrives!
    kgpIdx2,
    bsbIdx2
  );

  const txIncompatible = evaluateTransferConnection({
    interchangeStationCode: 'KGP',
    interchangeStationName: 'Kharagpur Junction',
    interchangeZone: 'SER',
    incomingLeg: leg1,
    outgoingLeg: incompatibleEarlierDateLeg,
    userTargetBufferMinutes: 180,
  });
  assert.ok(txIncompatible.scheduledLayoverMinutes < 0);
  assert.equal(txIncompatible.riskLevel, 'MISSED');
  assert.equal(txIncompatible.riskStatus, 'Connection likely missed');

  // Verify that findMultiRoutes rejects connections failing the targetBufferMinutes requirement when includeTighterConnections is false
  const strictBuffer240 = findMultiRoutes({
    fromCode: 'ROP',
    toCode: 'BSB',
    journeyDate: '2026-10-29',
    targetBufferMinutes: 240, // 4 hours minimum buffer
    maxDetourPct: 100,
    includeTighterConnections: false,
    maxLegs: 3,
    stationsDirectory: normalizedStations,
    trains: nationwideTrains,
  });

  for (const route of strictBuffer240.routes) {
    for (const tx of route.transfers) {
      assert.ok(
        tx.scheduledLayoverMinutes >= 240,
        `Route ${route.routeId} transfer at ${tx.interchangeStationCode} has ${tx.scheduledLayoverMinutes}m layover, which is below the required 240m buffer`
      );
      // Verify first train arrives before second train departs
      assert.ok(tx.scheduledLayoverMinutes > 0);
    }
  }
});

test('6. Connections without historical delay data are never shown as SAFE / Comfortable connection', () => {
  const ropBsb = findMultiRoutes({
    fromCode: 'ROP',
    toCode: 'BSB',
    journeyDate: '2026-10-29',
    targetBufferMinutes: 180,
    maxDetourPct: 100,
    includeTighterConnections: false,
    maxLegs: 2,
    stationsDirectory: normalizedStations,
    trains: nationwideTrains,
  });

  assert.ok(ropBsb.routes.length > 0);
  for (const route of ropBsb.routes) {
    assert.notEqual(
      route.overallRiskStatus,
      'Comfortable connection',
      'Routes without historical delay data must not be labeled "Comfortable connection"'
    );
    assert.notEqual(
      route.overallRiskLevel,
      'SAFE',
      'Routes without historical delay data must not be labeled SAFE'
    );
    assert.equal(
      route.overallRiskStatus,
      'Meets scheduled buffer (delay history unavailable)'
    );
    assert.equal(route.overallRiskLevel, 'UNKNOWN');
    assert.equal(
      route.recommendation.dataConfidence,
      'Medium (Historical Delay Unavailable)'
    );
    assert.equal(route.recommendation.historicalReliabilityScore, null);
    assert.equal(route.recommendation.weightsRenormalized, true);
  }
});

test('7. ROP -> BSB (Rupsa Junction to Varanasi Junction) verified against actual imported dataset: false PRP/GMO routes are absent and every leg has a traceable source record', () => {
  const ropBsbDirect = findDirectTrains('ROP', 'BSB', '2026-10-29', nationwideTrains);
  assert.equal(ropBsbDirect.length, 0, 'ROP -> BSB has 0 direct trains in DataMeet');

  const ropBsbMulti = findMultiRoutes({
    fromCode: 'ROP',
    toCode: 'BSB',
    journeyDate: '2026-10-29',
    targetBufferMinutes: 180,
    maxDetourPct: 100,
    includeTighterConnections: false,
    maxLegs: 3,
    stationsDirectory: normalizedStations,
    trains: nationwideTrains,
  });

  // 1. Verify false routes ROP -> PRP -> BSB and ROP -> GMO -> BSB do NOT appear
  const routeIds = ropBsbMulti.routes.map((r) => r.routeId);
  assert.equal(
    routeIds.includes('ROP->PRP->BSB'),
    false,
    'Unverified route ROP->PRP->BSB must not appear'
  );
  assert.equal(
    routeIds.includes('ROP->GMO->BSB'),
    false,
    'Unverified route ROP->GMO->BSB must not appear'
  );
  assert.equal(
    routeIds.includes('ROP->BLS->BSB'),
    false,
    'Corridor-backtracking route ROP->BLS->BSB must not appear'
  );

  // 2. Verify genuine 1-transfer routes ROP->KGP->BSB and ROP->HWH->BSB are discovered
  assert.ok(
    routeIds.includes('ROP->KGP->BSB'),
    'Expected verified 1-transfer route ROP->KGP->BSB via Kharagpur Junction'
  );
  assert.ok(
    routeIds.includes('ROP->HWH->BSB'),
    'Expected verified 1-transfer route ROP->HWH->BSB via Howrah Junction'
  );

  // 3. Verify every displayed route leg and every alternative leg option against the imported timetable
  for (const route of ropBsbMulti.routes) {
    for (const leg of route.selectedLegs) {
      assert.equal(
        verifyTrainLegAgainstTimetable(leg, nationwideTrains),
        true,
        `Selected leg ${leg.trainNumber} (${leg.fromStationCode}->${leg.toStationCode}) failed timetable verification`
      );
      assert.ok(leg.traceableSourceRecord, 'Leg must include traceableSourceRecord');
      assert.ok(
        leg.traceableSourceRecord.originStopSequence <
          leg.traceableSourceRecord.destinationStopSequence
      );
      // Verify distances are never invented: distanceReliable is true ONLY when both leg endpoints are the train's origin (0 km) and final destination (verified total km)
      if (leg.distanceReliable) {
        assert.ok(leg.distanceKm > 0);
      } else {
        assert.equal(leg.distanceKm, 0);
      }
    }
    for (const legOptions of route.availableTrainsByLeg) {
      for (const opt of legOptions) {
        assert.equal(
          verifyTrainLegAgainstTimetable(opt, nationwideTrains),
          true,
          `Available leg option ${opt.trainNumber} (${opt.fromStationCode}->${opt.toStationCode}) failed timetable verification`
        );
      }
    }
    for (const tx of route.transfers) {
      assert.ok(
        tx.scheduledLayoverMinutes >= 180,
        `Transfer at ${tx.interchangeStationCode} must meet the 180m target buffer`
      );
    }
  }
});

test('8. ROP -> ROU (Rupsa Junction to Rourkela Junction) verified against actual imported dataset', () => {
  const ropRouDirect = findDirectTrains('ROP', 'ROU', '2026-10-29', nationwideTrains);
  assert.equal(ropRouDirect.length, 0);

  const ropRouMulti = findMultiRoutes({
    fromCode: 'ROP',
    toCode: 'ROU',
    journeyDate: '2026-10-29',
    targetBufferMinutes: 180,
    maxDetourPct: 100,
    includeTighterConnections: false,
    maxLegs: 3,
    stationsDirectory: normalizedStations,
    trains: nationwideTrains,
  });

  assert.ok(
    ropRouMulti.routes.length >= 3,
    `Expected >= 3 verified routes for ROP -> ROU, got ${ropRouMulti.routes.length}`
  );
  assert.equal(ropRouMulti.diagnostics.status, 'NO_DIRECT_USE_CONNECTING');

  const routeIds = ropRouMulti.routes.map((r) => r.routeId);
  assert.ok(
    routeIds.includes('ROP->KGP->ROU'),
    'Expected verified 1-transfer route ROP->KGP->ROU via Kharagpur Junction'
  );
  assert.ok(
    routeIds.includes('ROP->BBS->ROU'),
    'Expected verified 1-transfer route ROP->BBS->ROU via Bhubaneswar'
  );

  for (const route of ropRouMulti.routes) {
    for (const leg of route.selectedLegs) {
      assert.equal(
        verifyTrainLegAgainstTimetable(leg, nationwideTrains),
        true,
        `Leg ${leg.trainNumber} (${leg.fromStationCode}->${leg.toStationCode}) failed timetable verification`
      );
      assert.ok(leg.traceableSourceRecord);
    }
    for (const tx of route.transfers) {
      assert.ok(tx.scheduledLayoverMinutes >= 180);
    }
  }
});

test('9. ROU -> BSB (Rourkela Junction to Varanasi Junction) discovers direct and multi-train routes from verified DataMeet records', () => {
  const rouBsbDirect = findDirectTrains('ROU', 'BSB', '2026-10-29', nationwideTrains);
  assert.equal(rouBsbDirect.length, 1);
  assert.equal(rouBsbDirect[0].trainNumber, '18311');
  assert.equal(verifyTrainLegAgainstTimetable(rouBsbDirect[0], nationwideTrains), true);

  const rouBsbMulti = findMultiRoutes({
    fromCode: 'ROU',
    toCode: 'BSB',
    journeyDate: '2026-10-29',
    targetBufferMinutes: 180,
    maxDetourPct: 100,
    includeTighterConnections: false,
    maxLegs: 3,
    stationsDirectory: normalizedStations,
    trains: nationwideTrains,
  });

  assert.ok(rouBsbMulti.routes.length >= 5);
  for (const route of rouBsbMulti.routes) {
    for (const leg of route.selectedLegs) {
      assert.equal(verifyTrainLegAgainstTimetable(leg, nationwideTrains), true);
    }
    for (const tx of route.transfers) {
      assert.ok(tx.scheduledLayoverMinutes >= 180);
    }
  }
});

test('10. Empty-result diagnostics accurately distinguish missing timetable data and unserved stations', () => {
  const missingDataRes = findMultiRoutes({
    fromCode: 'ROP',
    toCode: 'ROU',
    journeyDate: '2026-10-29',
    trains: [],
  });
  assert.equal(missingDataRes.routes.length, 0);
  assert.equal(missingDataRes.diagnostics.status, 'TIMETABLE_DATA_MISSING');

  const unservedOriginRes = findMultiRoutes({
    fromCode: 'ZZZZ',
    toCode: 'ROU',
    journeyDate: '2026-10-29',
    trains: nationwideTrains,
  });
  assert.equal(unservedOriginRes.routes.length, 0);
  assert.equal(unservedOriginRes.diagnostics.status, 'NO_TRAINS_AT_ORIGIN');
  assert.equal(unservedOriginRes.diagnostics.originTrainsCount, 0);
});

test('11. Live train status and two-train live comparison default to SCHEDULE_ONLY (0 fake delay) on verified DataMeet trains', () => {
  const ropTrainStatus = getLiveTrainStatus('18008', '2026-10-29', undefined, nationwideTrains);
  assert.ok(ropTrainStatus);
  assert.equal(ropTrainStatus.currentDelayMinutes, 0);
  assert.equal(ropTrainStatus.dataMode, 'SCHEDULE_ONLY');

  // Compare ROP->KGP train 18008 with KGP->BSB train 08043 at KGP
  const compKgp = compareTwoTrainsLive({
    incomingTrainNumber: '18008',
    outgoingTrainNumber: '08043',
    journeyDate: '2026-10-29',
    connectingStationCode: 'KGP',
    targetBufferMinutes: 180,
    trains: nationwideTrains,
  });
  assert.ok(compKgp);
  assert.equal(compKgp.connectingStationCode, 'KGP');
  assert.equal(compKgp.scheduledLayoverMinutes, 180);
  assert.equal(compKgp.incomingDelayMinutes, 0);
  assert.equal(compKgp.dataMode, 'SCHEDULE_ONLY');

  // Manual What-If delay override (+170m on 18008 leaving only 10m < 15m platform margin)
  const compMissed = compareTwoTrainsLive({
    incomingTrainNumber: '18008',
    outgoingTrainNumber: '08043',
    journeyDate: '2026-10-29',
    connectingStationCode: 'KGP',
    incomingDelayOverride: 170,
    outgoingDelayOverride: 0,
    targetBufferMinutes: 180,
    trains: nationwideTrains,
  });
  assert.ok(compMissed);
  assert.equal(compMissed.remainingTransferMinutes, 10);
  assert.equal(compMissed.comparisonStatus, 'Likely missed connection');
  assert.equal(compMissed.riskLevel, 'MISSED');
});

test('12. Runtime configuration defaults safely to "demo" mode and loads both station and nationwide timetable datasets', async () => {
  const { resolveRuntimeConfig, loadStationDataset, loadNationwideTimetable } = await import('../../server');

  const emptyEnvConfig = resolveRuntimeConfig({});
  assert.equal(emptyEnvConfig.dataMode, 'demo');
  assert.equal(emptyEnvConfig.defaultRelativePath, path.join('data', 'Railway_stations.json'));
  assert.equal(emptyEnvConfig.customEnvPath, '');

  const loadedStations = loadStationDataset({});
  assert.equal(loadedStations.raw.length, 8938);
  assert.equal(loadedStations.missingFileHelp, undefined);

  const loadedTimetable = loadNationwideTimetable();
  assert.ok(loadedTimetable.payload);
  assert.equal(loadedTimetable.payload.trains.length, 5058);
  assert.equal(loadedTimetable.missingTimetableHelp, undefined);
});

test('13. Phase 6 (1): ROU -> BPO (Rourkela Junction to Baripada) has 0 direct trains and discovers verified connecting routes via KGP, BBS, and CTC', () => {
  const rouBpoDirect = findDirectTrains('ROU', 'BPO', '2026-10-29', nationwideTrains);
  assert.equal(rouBpoDirect.length, 0, 'ROU -> BPO has 0 direct trains in the imported timetable');

  const rouBpoMulti = findMultiRoutes({
    fromCode: 'ROU',
    toCode: 'BPO',
    journeyDate: '2026-10-29',
    targetBufferMinutes: 180,
    maxDetourPct: 100,
    includeTighterConnections: false,
    maxLegs: 3,
    stationsDirectory: normalizedStations,
    trains: nationwideTrains,
  });

  assert.equal(rouBpoMulti.directTrainsCount, 0);
  assert.equal(rouBpoMulti.diagnostics.status, 'NO_DIRECT_USE_CONNECTING');
  assert.ok(
    rouBpoMulti.routes.length >= 2,
    `Expected verified connecting routes for ROU -> BPO, got ${rouBpoMulti.routes.length}`
  );

  const routeIds = rouBpoMulti.routes.map((r) => r.routeId);
  assert.ok(
    routeIds.includes('ROU->KGP->BPO'),
    'Expected 1-transfer route ROU->KGP->BPO via Kharagpur Junction'
  );
  assert.ok(
    routeIds.includes('ROU->BBS->BPO'),
    'Expected 1-transfer route ROU->BBS->BPO via Bhubaneswar'
  );

  for (const route of rouBpoMulti.routes) {
    assert.equal(route.stationSequence[0], 'ROU');
    assert.equal(route.stationSequence[route.stationSequence.length - 1], 'BPO');
    for (const leg of route.selectedLegs) {
      assert.equal(verifyTrainLegAgainstTimetable(leg, nationwideTrains), true);
      assert.ok(leg.traceableSourceRecord);
    }
    for (const tx of route.transfers) {
      assert.ok(tx.scheduledLayoverMinutes >= 180);
    }
  }
});

test('14. Phase 6 (2): ROP -> BPO (Rupsa Junction to Baripada) discovers verified direct trains 18007 and 12892 and prioritizes them', () => {
  const ropBpoDirect = findDirectTrains('ROP', 'BPO', '2026-10-29', nationwideTrains);
  assert.equal(ropBpoDirect.length, 2, 'ROP -> BPO has 2 verified direct trains in DataMeet');

  const trainNumbers = ropBpoDirect.map((t) => t.trainNumber).sort();
  assert.deepEqual(trainNumbers, ['12892', '18007']);

  for (const match of ropBpoDirect) {
    assert.equal(match.fromStationCode, 'ROP');
    assert.equal(match.toStationCode, 'BPO');
    assert.equal(verifyTrainLegAgainstTimetable(match, nationwideTrains), true);
    assert.ok(match.traceableSourceRecord);
    assert.ok(
      match.traceableSourceRecord.originStopSequence <
        match.traceableSourceRecord.destinationStopSequence
    );
  }

  // Universal search response also returns directTrains prominently alongside connecting route search
  const ropBpoSearch = findMultiRoutes({
    fromCode: 'ROP',
    toCode: 'BPO',
    journeyDate: '2026-10-29',
    stationsDirectory: normalizedStations,
    trains: nationwideTrains,
  });
  assert.equal(ropBpoSearch.directTrainsCount, 2);
  assert.ok(ropBpoSearch.directTrains);
  assert.equal(ropBpoSearch.directTrains.length, 2);
  assert.deepEqual(
    ropBpoSearch.directTrains.map((d) => d.trainNumber).sort(),
    ['12892', '18007']
  );
});

test('15. Phase 6 (5 & 6): Direct train + alternative connecting routes (ROU -> BSB) and station pair with no matching timetable records', () => {
  // Case 6: Direct train AND alternative connecting routes both returned in universal search
  const rouBsb = findMultiRoutes({
    fromCode: 'ROU',
    toCode: 'BSB',
    journeyDate: '2026-10-29',
    targetBufferMinutes: 180,
    maxDetourPct: 25,
    includeTighterConnections: false,
    stationsDirectory: normalizedStations,
    trains: nationwideTrains,
  });
  assert.equal(rouBsb.directTrainsCount, 1);
  assert.ok(rouBsb.directTrains && rouBsb.directTrains.length === 1);
  assert.equal(rouBsb.directTrains[0].trainNumber, '18311');
  assert.ok(
    rouBsb.routes.length > 0,
    'Connecting routes must be searched separately and returned as alternatives even when direct trains exist'
  );
  // Ensure direct train 18311 is not split into a fake 2-leg route
  for (const route of rouBsb.routes) {
    for (const leg of route.selectedLegs) {
      assert.notEqual(leg.trainNumber, '18311');
    }
  }

  // Case 5: Real station in 8,938-station directory with 0 stopping trains in imported timetable reports insufficient timetable coverage
  const stationWithZeroTrains = normalizedStations.find(
    (s) => !nationwideGraph.trainsAtStation.has(s.code)
  );
  assert.ok(stationWithZeroTrains, 'Should find a station in the 8,938 directory without timetable coverage');

  const noCoverageRes = findMultiRoutes({
    fromCode: stationWithZeroTrains.code,
    toCode: 'BPO',
    journeyDate: '2026-10-29',
    stationsDirectory: normalizedStations,
    trains: nationwideTrains,
  });
  assert.equal(noCoverageRes.directTrainsCount, 0);
  assert.equal(noCoverageRes.routes.length, 0);
  assert.equal(noCoverageRes.diagnostics.status, 'NO_TRAINS_AT_ORIGIN');
  assert.ok(
    noCoverageRes.diagnostics.summary.toLowerCase().includes('insufficient timetable coverage'),
    'Diagnostic summary must report insufficient timetable coverage instead of claiming no service exists'
  );
});

test('16. Phase 6 (7): Station accuracy — ROU, ROP, and BPO are never confused or substituted for one another', () => {
  const rou = getStationByCode(normalizedStations, 'ROU');
  const rop = getStationByCode(normalizedStations, 'ROP');
  const bpo = getStationByCode(normalizedStations, 'BPO');

  assert.ok(rou && rou.code === 'ROU' && rou.displayName === 'Rourkela Junction');
  assert.ok(rop && rop.code === 'ROP' && rop.displayName === 'Rupsa Junction');
  assert.ok(bpo && bpo.code === 'BPO' && bpo.displayName === 'Baripada');

  // Exact code searches always rank the exact station #1 and never substitute another station
  assert.equal(searchStations(normalizedStations, 'ROU', 5)[0].code, 'ROU');
  assert.equal(searchStations(normalizedStations, 'ROP', 5)[0].code, 'ROP');
  assert.equal(searchStations(normalizedStations, 'BPO', 5)[0].code, 'BPO');

  // Name searches resolve accurately to their respective station codes
  assert.equal(searchStations(normalizedStations, 'Rourkela Junction', 5)[0].code, 'ROU');
  assert.equal(searchStations(normalizedStations, 'Rupsa Junction', 5)[0].code, 'ROP');
  assert.equal(searchStations(normalizedStations, 'Baripada', 5)[0].code, 'BPO');

  // Route searches for ROP->BPO vs ROU->BPO vs ROP->ROU never substitute origin or destination codes
  const ropToBpo = findDirectTrains('ROP', 'BPO', '2026-10-29', nationwideTrains);
  const rouToBpo = findDirectTrains('ROU', 'BPO', '2026-10-29', nationwideTrains);
  assert.equal(ropToBpo.length, 2);
  assert.equal(rouToBpo.length, 0);
  for (const t of ropToBpo) {
    assert.equal(t.fromStationCode, 'ROP');
    assert.equal(t.toStationCode, 'BPO');
  }

  // Same-station search (e.g. ROU -> ROU) is rejected
  assert.equal(findDirectTrains('ROU', 'ROU', '2026-10-29', nationwideTrains).length, 0);
  assert.equal(
    findMultiRoutes({
      fromCode: 'ROU',
      toCode: 'ROU',
      journeyDate: '2026-10-29',
      trains: nationwideTrains,
    }).routes.length,
    0
  );
});

test('17. Phase 6 (8): Invalid journey dates and operating days are strictly validated', () => {
  // 1. Calendar validation rejects malformed and impossible dates (e.g. Feb 30, month 13, empty string)
  assert.equal(isValidJourneyDate('2026-10-29'), true);
  assert.equal(isValidJourneyDate('2024-02-29'), true); // 2024 is leap year
  assert.equal(isValidJourneyDate('2026-02-29'), false); // 2026 is not leap year
  assert.equal(isValidJourneyDate('2026-02-30'), false);
  assert.equal(isValidJourneyDate('2026-13-01'), false);
  assert.equal(isValidJourneyDate('not-a-date'), false);
  assert.equal(isValidJourneyDate(''), false);

  // Direct and multi-route searches reject invalid dates cleanly
  assert.equal(findDirectTrains('ROP', 'BPO', '2026-02-30', nationwideTrains).length, 0);
  assert.equal(findDirectTrains('ROP', 'BPO', 'invalid-date', nationwideTrains).length, 0);

  const invalidMulti = findMultiRoutes({
    fromCode: 'ROU',
    toCode: 'BPO',
    journeyDate: '2026-02-30',
    stationsDirectory: normalizedStations,
    trains: nationwideTrains,
  });
  assert.equal(invalidMulti.routes.length, 0);
  assert.equal(invalidMulti.directTrainsCount, 0);
  assert.equal(invalidMulti.diagnostics.status, 'INVALID_JOURNEY_DATE');

  // 2. Operating days validation with multi-day stop offset
  // Suppose a train originates on Day 1 only on Wednesdays ('Wed') and reaches ROU on Day 2 (Thursday)
  const wedOnlyTrain: TrainService = {
    ...nationwideGraph.trainByNumber.get('18007')!,
    trainNumber: '98007',
    operatingDays: ['Wed'],
    operatingDaysAvailable: true,
    stops: [
      {
        stationCode: 'SHM',
        stationName: 'Shalimar',
        stopSequence: 1,
        arrivalTime: null,
        departureTime: '22:00',
        haltMinutes: 0,
        dayOffset: 1,
        distanceKm: 0,
      },
      {
        stationCode: 'ROP',
        stationName: 'Rupsa Junction',
        stopSequence: 2,
        arrivalTime: '01:30',
        departureTime: '01:35',
        haltMinutes: 5,
        dayOffset: 2, // Reaches ROP on Day 2!
        distanceKm: -1,
      },
      {
        stationCode: 'BPO',
        stationName: 'Baripada',
        stopSequence: 3,
        arrivalTime: '03:00',
        departureTime: null,
        haltMinutes: 0,
        dayOffset: 2,
        distanceKm: 265,
      },
    ],
  };

  // 2026-10-28 is Wednesday, 2026-10-29 is Thursday.
  // At SHM (dayOffset=1), train operates on Wed 2026-10-28, NOT Thu 2026-10-29:
  assert.equal(doesTrainOperateAtStopOnDate(wedOnlyTrain, wedOnlyTrain.stops[0], '2026-10-28'), true);
  assert.equal(doesTrainOperateAtStopOnDate(wedOnlyTrain, wedOnlyTrain.stops[0], '2026-10-29'), false);

  // At ROP (dayOffset=2), boarding on Thu 2026-10-29 corresponds to Wednesday 2026-10-28 origin departure:
  assert.equal(doesTrainOperateAtStopOnDate(wedOnlyTrain, wedOnlyTrain.stops[1], '2026-10-29'), true);
  assert.equal(doesTrainOperateAtStopOnDate(wedOnlyTrain, wedOnlyTrain.stops[1], '2026-10-28'), false);

  // Direct search from ROP to BPO on wedOnlyTrain matches on Thursday 2026-10-29 but NOT Wednesday 2026-10-28:
  assert.equal(findDirectTrains('ROP', 'BPO', '2026-10-29', [wedOnlyTrain]).length, 1);
  assert.equal(findDirectTrains('ROP', 'BPO', '2026-10-28', [wedOnlyTrain]).length, 0);
});

test('18. Part 2 & Part 5 (7): Railway leg distance is calculated accurately using cumulative stop distances (destinationKm - boardingKm) and summed across 2-leg and 3-leg routes', () => {
  // 1. Test exact cumulative distance subtraction example:
  // Train X stops at Rourkela (ROU) at 413 km and Ranchi (RNC) at 580 km -> leg distance = 580 - 413 = 167 km
  const cumulativePayload: NationwideTimetablePayload = {
    source: 'Cumulative Distance Test Dataset',
    license: 'CC0',
    freshness: 'Test',
    operatingDaysAvailable: false,
    trainsCount: 3,
    trains: [
      {
        n: '90001',
        name: 'Howrah Hatia Cumulative Test Exp',
        t: 'EXP',
        dist: 600,
        s: [
          { c: 'HWH', a: null, d: '06:00', day: 1, km: 0 },
          { c: 'ROU', a: '12:00', d: '12:10', day: 1, km: 413 },
          { c: 'RNC', a: '15:10', d: '15:20', day: 1, km: 580 },
          { c: 'HTE', a: '15:45', d: null, day: 1, km: 600 },
        ],
      },
      {
        n: '90002',
        name: 'Ranchi Varanasi Cumulative Test Exp',
        t: 'EXP',
        dist: 517,
        s: [
          { c: 'RNC', a: null, d: '19:00', day: 1, km: 0 },
          { c: 'DDU', a: '03:00', d: '03:10', day: 2, km: 500 },
          { c: 'BSB', a: '04:00', d: null, day: 2, km: 517 },
        ],
      },
      {
        n: '90003',
        name: 'DDU Varanasi Shuttle Test Exp',
        t: 'EXP',
        dist: 17,
        s: [
          { c: 'DDU', a: null, d: '06:30', day: 2, km: 0 },
          { c: 'BSB', a: '07:15', d: null, day: 2, km: 17 },
        ],
      },
    ],
  };

  const testServices = buildNationwideTrainServices(cumulativePayload, normalizedStations, null);
  assert.equal(testServices.length, 3);

  const train90001 = testServices.find((t) => t.trainNumber === '90001')!;
  const rouStop = train90001.stops.find((s) => s.stationCode === 'ROU')!;
  const rncStop = train90001.stops.find((s) => s.stationCode === 'RNC')!;
  assert.equal(rouStop.distanceKm, 413);
  assert.equal(rncStop.distanceKm, 580);

  const legDistInfo = calculateVerifiedLegDistance(train90001, rouStop, rncStop, 1, 2);
  assert.equal(legDistInfo.distanceKm, 167, '580 - 413 must equal 167 km');
  assert.equal(legDistInfo.distanceReliable, true);
  assert.equal(legDistInfo.distanceVerified, true);
  assert.equal(legDistInfo.distanceSource, 'VERIFIED_TIMETABLE_CUMULATIVE_KM');

  // Verify 2-leg route ROU -> RNC -> BSB sums 167 + 517 = 684 km
  const multiRes = findMultiRoutes({
    fromCode: 'ROU',
    toCode: 'BSB',
    journeyDate: '2026-10-29',
    targetBufferMinutes: 180,
    maxDetourPct: 100,
    maxLegs: 3,
    stationsDirectory: normalizedStations,
    trains: testServices,
  });

  const routeRouRncBsb = multiRes.routes.find((r) => r.routeId === 'ROU->RNC->BSB');
  assert.ok(routeRouRncBsb, 'Should discover 2-leg route ROU->RNC->BSB');
  assert.equal(routeRouRncBsb.selectedLegs[0].distanceKm, 167);
  assert.equal(routeRouRncBsb.selectedLegs[1].distanceKm, 517);
  assert.equal(routeRouRncBsb.totalDistanceKm, 684, 'Total 2-leg distance must be 167 + 517 = 684 km');
  assert.equal(routeRouRncBsb.distanceReliable, true);
  assert.equal(routeRouRncBsb.distanceVerified, true);
  assert.equal(routeRouRncBsb.distanceSource, 'VERIFIED_TIMETABLE_CUMULATIVE_KM');

  // Verify 3-leg route ROU -> RNC -> DDU -> BSB sums 167 + 500 + 17 = 684 km
  const leg1 = buildRouteLegOption(0, train90001, rouStop, rncStop, '2026-10-29', 1, 2);
  const train90002 = testServices.find((t) => t.trainNumber === '90002')!;
  const leg2 = buildRouteLegOption(
    1,
    train90002,
    train90002.stops[0],
    train90002.stops[1],
    '2026-10-29',
    0,
    1
  );
  const train90003 = testServices.find((t) => t.trainNumber === '90003')!;
  const leg3 = buildRouteLegOption(
    2,
    train90003,
    train90003.stops[0],
    train90003.stops[1],
    '2026-10-30',
    0,
    1
  );
  assert.equal(leg1.distanceKm, 167);
  assert.equal(leg2.distanceKm, 500);
  assert.equal(leg3.distanceKm, 17);

  const threeLegDist = calculateVerifiedRouteDistance([leg1, leg2, leg3]);
  assert.equal(threeLegDist.totalDistanceKm, 684);
  assert.equal(threeLegDist.distanceReliable, true);
  assert.equal(threeLegDist.distanceVerified, true);

  // Also verify real routes ROU -> KGP -> BPO (297 + 152 = 449 km) and ROU -> BBS -> BPO (419 + 275 = 694 km)
  const rouBpoRes = findMultiRoutes({
    fromCode: 'ROU',
    toCode: 'BPO',
    journeyDate: '2026-10-29',
    targetBufferMinutes: 180,
    maxDetourPct: 100,
    stationsDirectory: normalizedStations,
    trains: nationwideTrains,
  });
  const rouKgpBpo = rouBpoRes.routes.find((r) => r.routeId === 'ROU->KGP->BPO');
  assert.ok(rouKgpBpo);
  assert.equal(rouKgpBpo.selectedLegs[0].distanceKm, 297);
  assert.equal(rouKgpBpo.selectedLegs[1].distanceKm, 152);
  assert.equal(rouKgpBpo.totalDistanceKm, 449);
  assert.equal(rouKgpBpo.distanceReliable, true);

  const rouBbsBpo = rouBpoRes.routes.find((r) => r.routeId === 'ROU->BBS->BPO');
  assert.ok(rouBbsBpo);
  assert.equal(rouBbsBpo.selectedLegs[0].distanceKm, 419);
  assert.equal(rouBbsBpo.selectedLegs[1].distanceKm, 275);
  assert.equal(rouBbsBpo.totalDistanceKm, 694);
  assert.equal(rouBbsBpo.distanceReliable, true);
});

test('19. Part 2 & Part 5 (8, 9): Missing leg distances show exact honest message and routes with missing distance data are never discarded', () => {
  // Construct a 2-train corridor where Leg 1 has verified distance (297 km) and Leg 2 has missing intermediate stop distance (null)
  const missingStopPayload: NationwideTimetablePayload = {
    source: 'Missing Stop Distance Test Payload',
    license: 'CC0',
    freshness: 'Test',
    operatingDaysAvailable: false,
    trainsCount: 2,
    trains: [
      {
        n: '91001',
        name: 'ROU KGP Verified Leg Test Exp',
        t: 'EXP',
        dist: 297,
        s: [
          { c: 'ROU', a: null, d: '06:00', day: 1, km: 0 },
          { c: 'KGP', a: '11:00', d: null, day: 1, km: 297 },
        ],
      },
      {
        n: '91002',
        name: 'HWH BPO Missing Intermediate Stop Test Exp',
        t: 'EXP',
        dist: 268,
        s: [
          { c: 'HWH', a: null, d: '12:00', day: 1, km: 0 },
          { c: 'KGP', a: '14:00', d: '14:10', day: 1, km: null }, // Missing cumulative km at intermediate boarding stop
          { c: 'BPO', a: '17:00', d: null, day: 1, km: 268 },
        ],
      },
    ],
  };

  const missingStopTrains = buildNationwideTrainServices(
    missingStopPayload,
    normalizedStations,
    null
  );

  const rouBpoRes = findMultiRoutes({
    fromCode: 'ROU',
    toCode: 'BPO',
    journeyDate: '2026-10-29',
    targetBufferMinutes: 180,
    maxDetourPct: 25,
    stationsDirectory: normalizedStations,
    trains: missingStopTrains,
  });

  const rouKgpBpo = rouBpoRes.routes.find((r) => r.routeId === 'ROU->KGP->BPO');
  assert.ok(
    rouKgpBpo,
    'Route ROU->KGP->BPO with missing stop distance must not be discarded'
  );
  assert.equal(rouKgpBpo.selectedLegs[0].distanceKm, 297);
  assert.equal(rouKgpBpo.selectedLegs[0].distanceReliable, true);
  assert.equal(rouKgpBpo.selectedLegs[1].distanceKm, 0);
  assert.equal(rouKgpBpo.selectedLegs[1].distanceReliable, false);
  assert.equal(rouKgpBpo.totalDistanceKm, 0);
  assert.equal(rouKgpBpo.distanceReliable, false);
  assert.equal(rouKgpBpo.distanceVerified, false);
  assert.equal(rouKgpBpo.distanceSource, 'MISSING_LEG_DISTANCE_DATA');
  assert.equal(
    rouKgpBpo.distanceStatusMessage,
    'Total distance unavailable — distance data missing for one or more legs'
  );
  assert.equal(rouKgpBpo.distanceStatusMessage, MISSING_TOTAL_DISTANCE_MESSAGE);
  assert.equal(
    rouKgpBpo.distanceIncompleteDetail,
    'Distance incomplete — distance data unavailable for one leg.'
  );
  assert.equal(rouKgpBpo.verifiedLegsCount, 1);
  assert.equal(rouKgpBpo.missingLegsCount, 1);
});

test('20. Part 4 & Part 5 (5, 6): Each leg shows only verified trains serving its exact boarding and destination stations, and custom train selections remain isolated per route', () => {
  const rouBsbRes = findMultiRoutes({
    fromCode: 'ROU',
    toCode: 'BSB',
    journeyDate: '2026-10-29',
    targetBufferMinutes: 180,
    maxDetourPct: 100,
    includeTighterConnections: false,
    stationsDirectory: normalizedStations,
    trains: nationwideTrains,
  });

  assert.ok(rouBsbRes.routes.length >= 4);

  for (const route of rouBsbRes.routes) {
    assert.equal(
      route.availableTrainsByLeg.length,
      route.stationSequence.length - 1
    );

    for (let legIdx = 0; legIdx < route.availableTrainsByLeg.length; legIdx++) {
      const expectedFrom = route.stationSequence[legIdx];
      const expectedTo = route.stationSequence[legIdx + 1];
      const legOptions = route.availableTrainsByLeg[legIdx];
      assert.ok(legOptions.length >= 1);

      const seenTrainNums = new Set<string>();
      for (const opt of legOptions) {
        assert.equal(
          opt.fromStationCode,
          expectedFrom,
          `Route ${route.routeId} leg ${legIdx + 1} option ${opt.trainNumber} must board at ${expectedFrom}`
        );
        assert.equal(
          opt.toStationCode,
          expectedTo,
          `Route ${route.routeId} leg ${legIdx + 1} option ${opt.trainNumber} must alight at ${expectedTo}`
        );
        assert.equal(
          seenTrainNums.has(opt.trainNumber),
          false,
          `Duplicate train ${opt.trainNumber} in route ${route.routeId} leg ${legIdx + 1}`
        );
        seenTrainNums.add(opt.trainNumber);
        assert.equal(verifyTrainLegAgainstTimetable(opt, nationwideTrains), true);
      }
    }
  }

  // Test custom leg selection isolation and distance/duration consistency on a route with multiple leg options
  const routeWithMultiLegOpts = rouBsbRes.routes.find(
    (r) => r.availableTrainsByLeg[0].length >= 2
  )!;
  assert.ok(routeWithMultiLegOpts);
  const altLeg1 = routeWithMultiLegOpts.availableTrainsByLeg[0][1];
  const updatedRoute = evaluateCustomLegSelection({
    route: routeWithMultiLegOpts,
    selectedLegs: [altLeg1, ...routeWithMultiLegOpts.selectedLegs.slice(1)],
    targetBufferMinutes: 180,
  });

  assert.equal(updatedRoute.routeId, routeWithMultiLegOpts.routeId);
  assert.equal(updatedRoute.selectedLegs[0].trainNumber, altLeg1.trainNumber);
  assert.equal(updatedRoute.selectedLegs[0].fromStationCode, routeWithMultiLegOpts.stationSequence[0]);
  assert.equal(updatedRoute.selectedLegs[0].toStationCode, routeWithMultiLegOpts.stationSequence[1]);
});

test('21. Phase 5, 6 & 7: Direct train 18311 and connecting routes on ROU -> BSB resolve verified cumulative stop distances and assign Recommendation Badges', () => {
  // 1. Direct train 18311 on ROU -> BSB resolves to 745 km via VERIFIED_TIMETABLE_CUMULATIVE_KM (945 km - 200 km)
  const rouBsbDirect = findDirectTrains('ROU', 'BSB', '2026-10-28', nationwideTrains);
  assert.equal(rouBsbDirect.length, 1);
  assert.equal(rouBsbDirect[0].trainNumber, '18311');
  assert.equal(rouBsbDirect[0].distanceKm, 745);
  assert.equal(rouBsbDirect[0].distanceReliable, true);
  assert.equal(rouBsbDirect[0].distanceVerified, true);
  assert.equal(rouBsbDirect[0].distanceSource, 'VERIFIED_TIMETABLE_CUMULATIVE_KM');

  // 2. Connecting routes on ROU -> BSB resolve verified cumulative stop distances and assign Recommendation Badges
  const rouBsbMulti = findMultiRoutes({
    fromCode: 'ROU',
    toCode: 'BSB',
    journeyDate: '2026-10-28',
    targetBufferMinutes: 180,
    maxDetourPct: 25,
    includeTighterConnections: false,
    stationsDirectory: normalizedStations,
    trains: nationwideTrains,
  });

  assert.equal(rouBsbMulti.baselineDistanceKm, 745);
  assert.equal(rouBsbMulti.baselineType, 'DIRECT_TRAIN_BASELINE');

  const dhnRoute = rouBsbMulti.routes.find((r) => r.routeId === 'ROU->DHN->BSB');
  assert.ok(dhnRoute, 'Should find ROU->DHN->BSB within +25% detour limit');
  assert.equal(dhnRoute.selectedLegs[0].distanceKm, 337);
  assert.equal(dhnRoute.selectedLegs[1].distanceKm, 419);
  assert.equal(dhnRoute.totalDistanceKm, 756);
  assert.equal(dhnRoute.distanceReliable, true);
  assert.equal(dhnRoute.distanceSource, 'VERIFIED_TIMETABLE_CUMULATIVE_KM');
  assert.equal(dhnRoute.recommendation.scoreAvailable, true);
  assert.ok(
    dhnRoute.recommendation.totalScore >= 50 &&
      dhnRoute.recommendation.totalScore <= 100
  );
  assert.ok(
    dhnRoute.recommendation.scheduleDisclaimer?.includes(
      'not a guarantee of punctuality'
    )
  );

  // Verify at least one route has 'Recommended' or 'Lowest Distance' badge
  const badges = rouBsbMulti.routes
    .map((r) => r.recommendationBadge)
    .filter(Boolean);
  assert.ok(badges.length >= 1, 'Expected data-justified recommendation badges');
});

test('22. Phase 8: All 12 required railway distance calculation edge cases & validation rules', () => {
  // Case 1: Origin to final destination on the same train (12809 CSMT -> HWH: 1968 - 0 = 1968 km)
  const train12809 = nationwideGraph.trainByNumber.get('12809')!;
  assert.ok(train12809);
  const c1 = calculateVerifiedLegDistance(
    train12809,
    train12809.stops[0],
    train12809.stops[train12809.stops.length - 1],
    0,
    train12809.stops.length - 1
  );
  assert.equal(c1.distanceKm, 1968);
  assert.equal(c1.distanceReliable, true);
  assert.equal(c1.distanceSource, 'VERIFIED_TIMETABLE_CUMULATIVE_KM');

  // Case 2: Boarding at an intermediate stop to final destination (18311 boarding at ROU [151 km] to BSB [896 km] = 745 km)
  const train18311 = nationwideGraph.trainByNumber.get('18311')!;
  const rouIdx = train18311.stops.findIndex((s) => s.stationCode === 'ROU');
  const bsbIdx = train18311.stops.findIndex((s) => s.stationCode === 'BSB');
  const c2 = calculateVerifiedLegDistance(
    train18311,
    train18311.stops[rouIdx],
    train18311.stops[bsbIdx],
    rouIdx,
    bsbIdx
  );
  assert.equal(train18311.stops[rouIdx].distanceKm, 151);
  assert.equal(train18311.stops[bsbIdx].distanceKm, 896);
  assert.equal(c2.distanceKm, 745);
  assert.equal(c2.distanceReliable, true);
  assert.equal(c2.distanceSource, 'VERIFIED_TIMETABLE_CUMULATIVE_KM');

  // Case 3: Alighting at an intermediate stop (18007 SHM [0 km] -> ROP [214 km] before final stop BPO [265 km])
  const train18007 = nationwideGraph.trainByNumber.get('18007')!;
  const shmIdx = 0;
  const ropIdx = train18007.stops.findIndex((s) => s.stationCode === 'ROP');
  const c3 = calculateVerifiedLegDistance(
    train18007,
    train18007.stops[shmIdx],
    train18007.stops[ropIdx],
    shmIdx,
    ropIdx
  );
  assert.equal(c3.distanceKm, 214);
  assert.equal(c3.distanceReliable, true);
  assert.equal(c3.distanceSource, 'VERIFIED_TIMETABLE_CUMULATIVE_KM');

  // Case 4: Overnight train with day change (12669 MAS [Day 1, 0 km] -> BSB [Day 2/3, 2136 km])
  const train12669 = nationwideGraph.trainByNumber.get('12669')!;
  const masIdx = train12669.stops.findIndex((s) => s.stationCode === 'MAS');
  const bsbIdx12669 = train12669.stops.findIndex((s) => s.stationCode === 'BSB');
  assert.ok(train12669.stops[bsbIdx12669].dayOffset > train12669.stops[masIdx].dayOffset);
  const legOvernight = buildRouteLegOption(
    0,
    train12669,
    train12669.stops[masIdx],
    train12669.stops[bsbIdx12669],
    '2026-10-29',
    masIdx,
    bsbIdx12669
  );
  assert.equal(legOvernight.distanceKm, 2136);
  assert.equal(legOvernight.distanceReliable, true);
  assert.equal(legOvernight.arrivalDate, '2026-10-31');

  // Case 5: Different trains covering the same station pair (RNC -> BSB on 18609 [539 km] vs 18611 [572 km])
  const train18609 = nationwideGraph.trainByNumber.get('18609')!;
  const train18611 = nationwideGraph.trainByNumber.get('18611')!;
  const d18609 = calculateVerifiedLegDistance(
    train18609,
    train18609.stops[train18609.stops.findIndex((s) => s.stationCode === 'RNC')],
    train18609.stops[train18609.stops.findIndex((s) => s.stationCode === 'BSB')]
  );
  const d18611 = calculateVerifiedLegDistance(
    train18611,
    train18611.stops[train18611.stops.findIndex((s) => s.stationCode === 'RNC')],
    train18611.stops[train18611.stops.findIndex((s) => s.stationCode === 'BSB')]
  );
  assert.equal(d18609.distanceKm, 539);
  assert.equal(d18611.distanceKm, 572);
  assert.notEqual(d18609.distanceKm, d18611.distanceKm);

  // Case 6: Two-leg connecting journey (ROU -> MURI -> BSB = 236 + 473 = 709 km)
  const train18601 = nationwideGraph.trainByNumber.get('18601')!;
  const train12875 = nationwideGraph.trainByNumber.get('12875')!;
  const legA = buildRouteLegOption(
    0,
    train18601,
    train18601.stops[train18601.stops.findIndex((s) => s.stationCode === 'ROU')],
    train18601.stops[train18601.stops.findIndex((s) => s.stationCode === 'MURI')],
    '2026-10-29'
  );
  const legB = buildRouteLegOption(
    1,
    train12875,
    train12875.stops[train12875.stops.findIndex((s) => s.stationCode === 'MURI')],
    train12875.stops[train12875.stops.findIndex((s) => s.stationCode === 'BSB')],
    '2026-10-29'
  );
  const twoLegSum = calculateVerifiedRouteDistance([legA, legB]);
  assert.equal(legA.distanceKm, 236);
  assert.equal(legB.distanceKm, 473);
  assert.equal(twoLegSum.totalDistanceKm, 709);
  assert.equal(twoLegSum.distanceReliable, true);

  // Case 7: Three-leg connecting journey (MAS -> ET -> PRYJ -> BSB = 1390 + 612 + 115 = 2117 km)
  const train12621 = nationwideGraph.trainByNumber.get('12621')!;
  const train11055 = nationwideGraph.trainByNumber.get('11055')!;
  const train12382 = nationwideGraph.trainByNumber.get('12382')!;
  const l3_1 = buildRouteLegOption(
    0,
    train12621,
    train12621.stops[train12621.stops.findIndex((s) => s.stationCode === 'MAS')],
    train12621.stops[train12621.stops.findIndex((s) => s.stationCode === 'ET')],
    '2026-10-29'
  );
  const l3_2 = buildRouteLegOption(
    1,
    train11055,
    train11055.stops[train11055.stops.findIndex((s) => s.stationCode === 'ET')],
    train11055.stops[train11055.stops.findIndex((s) => s.stationCode === 'PRYJ')],
    '2026-10-30'
  );
  const l3_3 = buildRouteLegOption(
    2,
    train12382,
    train12382.stops[train12382.stops.findIndex((s) => s.stationCode === 'PRYJ')],
    train12382.stops[train12382.stops.findIndex((s) => s.stationCode === 'BSB')],
    '2026-10-30'
  );
  const threeLegSum = calculateVerifiedRouteDistance([l3_1, l3_2, l3_3]);
  assert.equal(l3_1.distanceKm, 1390);
  assert.equal(l3_2.distanceKm, 612);
  assert.equal(l3_3.distanceKm, 115);
  assert.equal(threeLegSum.totalDistanceKm, 2117);
  assert.equal(threeLegSum.distanceReliable, true);

  // Case 8: Missing cumulative stop distance (58151 BRMP -> ROU where ROU stop km is -1)
  const train58151 = nationwideGraph.trainByNumber.get('58151')!;
  const brmpStop = train58151.stops[0];
  const rouStop58151 = train58151.stops.find((s) => s.stationCode === 'ROU')!;
  assert.equal(rouStop58151.distanceKm, -1);
  const c8 = calculateVerifiedLegDistance(train58151, brmpStop, rouStop58151);
  assert.equal(c8.distanceKm, 0);
  assert.equal(c8.distanceReliable, false);
  assert.equal(c8.distanceSource, 'MISSING_STOP_DISTANCE_DATA');

  // Case 9: Non-monotonic distance values (0 -> 250 -> 190 -> 400 must be quarantined as -1 and rejected)
  const nonMonotonicPayload: NationwideTimetablePayload = {
    source: 'Non-Monotonic Test',
    license: 'CC0',
    freshness: 'Test',
    operatingDaysAvailable: false,
    trainsCount: 1,
    trains: [
      {
        n: '99109',
        name: 'Non-Monotonic Test Train',
        t: 'EXP',
        dist: 400,
        s: [
          { c: 'ROU', a: null, d: '08:00', day: 1, km: 0 },
          { c: 'TATA', a: '10:30', d: '10:35', day: 1, km: 250 },
          { c: 'KGP', a: '12:30', d: '12:40', day: 1, km: 190 }, // Decreases!
          { c: 'HWH', a: '14:30', d: null, day: 1, km: 400 },
        ],
      },
    ],
  };
  const builtNonMono = buildNationwideTrainServices(nonMonotonicPayload, normalizedStations, null);
  assert.equal(builtNonMono.length, 1);
  assert.equal(builtNonMono[0].distanceReliable, false);
  assert.deepEqual(builtNonMono[0].stops.map((s) => s.distanceKm), [-1, -1, -1, -1]);

  // Also test direct call to calculateVerifiedLegDistance on a raw TrainService with non-monotonic stops
  const rawNonMonoService: TrainService = {
    ...builtNonMono[0],
    stops: [
      { ...builtNonMono[0].stops[0], distanceKm: 0 },
      { ...builtNonMono[0].stops[1], distanceKm: 250 },
      { ...builtNonMono[0].stops[2], distanceKm: 190 },
      { ...builtNonMono[0].stops[3], distanceKm: 400 },
    ],
  };
  const c9 = calculateVerifiedLegDistance(
    rawNonMonoService,
    rawNonMonoService.stops[0],
    rawNonMonoService.stops[3],
    0,
    3,
    nationwideTrains // Even when nationwideTrains is passed, non-monotonic train stops must NOT fallback!
  );
  assert.equal(c9.distanceKm, 0);
  assert.equal(c9.distanceReliable, false);
  assert.equal(c9.distanceSource, 'MISSING_STOP_DISTANCE_DATA');

  // Case 10: Repeated station codes (circular/loop train A -> B -> C -> A)
  const circularPayload: NationwideTimetablePayload = {
    source: 'Circular Route Test',
    license: 'CC0',
    freshness: 'Test',
    operatingDaysAvailable: false,
    trainsCount: 1,
    trains: [
      {
        n: '99110',
        name: 'Circular Loop Test Express',
        t: 'EXP',
        dist: 350,
        s: [
          { c: 'ROU', a: null, d: '06:00', day: 1, km: 0 },
          { c: 'TATA', a: '08:30', d: '08:35', day: 1, km: 164 },
          { c: 'KGP', a: '10:30', d: '10:40', day: 1, km: 298 },
          { c: 'ROU', a: '14:00', d: null, day: 1, km: 350 }, // Revisits ROU at stopSequence 4 (350 km)
        ],
      },
    ],
  };
  const circularServices = buildNationwideTrainServices(circularPayload, normalizedStations, null);
  assert.equal(circularServices.length, 1);
  // Boarding at TATA (idx 1, 164 km) to second ROU occurrence (idx 3, 350 km) = 186 km
  const circularMatches = findDirectTrains('TATA', 'ROU', '2026-10-29', circularServices);
  assert.equal(circularMatches.length, 1);
  assert.equal(circularMatches[0].distanceKm, 186);
  assert.equal(circularMatches[0].distanceReliable, true);
  assert.equal(circularMatches[0].traceableSourceRecord?.originStopSequence, 2);
  assert.equal(circularMatches[0].traceableSourceRecord?.destinationStopSequence, 4);

  // Case 11: Incorrect train direction (destination stop appears BEFORE boarding stop in train sequence)
  const c11 = calculateVerifiedLegDistance(
    train18311,
    train18311.stops[bsbIdx],
    train18311.stops[rouIdx],
    bsbIdx,
    rouIdx
  );
  assert.equal(c11.distanceKm, 0);
  assert.equal(c11.distanceReliable, false);
  assert.equal(c11.distanceSource, 'MISSING_STOP_DISTANCE_DATA');

  // Case 12: Train overall distance vs final cumulative stop distance mismatch is quarantined
  const conflictingOverallPayload: NationwideTimetablePayload = {
    source: 'Conflicting Overall Distance Test',
    license: 'CC0',
    freshness: 'Test',
    operatingDaysAvailable: false,
    trainsCount: 1,
    trains: [
      {
        n: '99112',
        name: 'Conflicting Overall Distance Train',
        t: 'EXP',
        dist: 600, // Train overall distance says 600 km
        s: [
          { c: 'ROU', a: null, d: '06:00', day: 1, km: 0 },
          { c: 'TATA', a: '08:30', d: '08:35', day: 1, km: 164 },
          { c: 'KGP', a: '10:30', d: null, day: 1, km: 298 }, // Final stop says 298 km (diff = 302 km > 5%)
        ],
      },
    ],
  };
  const builtConflicting = buildNationwideTrainServices(
    conflictingOverallPayload,
    normalizedStations,
    null
  );
  assert.equal(builtConflicting.length, 1);
  assert.equal(builtConflicting[0].distanceReliable, false);
  assert.deepEqual(builtConflicting[0].stops.map((s) => s.distanceKm), [-1, -1, -1]);
});

test('23. Phase 8: Real searches (ROU->BSB, ROU->BPO, ROP->ROU, MAS->BSB) return verified cumulative distances on all default route options', () => {
  const realCorridors = [
    { from: 'ROU', to: 'BSB', minRoutes: 5, expectedDirectKm: 745 },
    { from: 'ROU', to: 'BPO', minRoutes: 1, expectedDirectKm: 0 },
    { from: 'ROP', to: 'ROU', minRoutes: 1, expectedDirectKm: 0 },
    { from: 'MAS', to: 'BSB', minRoutes: 10, expectedDirectKm: 2136 },
  ];

  for (const { from, to, minRoutes, expectedDirectKm } of realCorridors) {
    const direct = findDirectTrains(from, to, '2026-10-29', nationwideTrains);
    if (expectedDirectKm > 0) {
      assert.ok(direct.length >= 1, `Expected direct train on ${from}->${to}`);
      assert.equal(direct[0].distanceKm, expectedDirectKm);
      assert.equal(direct[0].distanceReliable, true);
      assert.equal(direct[0].distanceSource, 'VERIFIED_TIMETABLE_CUMULATIVE_KM');
    } else {
      assert.equal(direct.length, 0);
    }

    const multi = findMultiRoutes({
      fromCode: from,
      toCode: to,
      journeyDate: '2026-10-29',
      targetBufferMinutes: 180,
      maxDetourPct: 25,
      includeTighterConnections: false,
      stationsDirectory: normalizedStations,
      trains: nationwideTrains,
    });

    assert.ok(
      multi.routes.length >= minRoutes,
      `Expected >= ${minRoutes} routes for ${from}->${to}, got ${multi.routes.length}`
    );

    for (const route of multi.routes) {
      assert.equal(
        route.distanceReliable,
        true,
        `Route ${route.routeId} on ${from}->${to} must have verified total distance`
      );
      assert.ok(
        route.totalDistanceKm > 0,
        `Route ${route.routeId} on ${from}->${to} must have totalDistanceKm > 0`
      );
      const sumLegs = Number(
        route.selectedLegs.reduce((acc, l) => acc + l.distanceKm, 0).toFixed(2)
      );
      assert.equal(
        route.totalDistanceKm,
        sumLegs,
        `Route ${route.routeId} totalDistanceKm (${route.totalDistanceKm}) must equal sum of leg distances (${sumLegs})`
      );
    for (const leg of route.selectedLegs) {
        assert.equal(leg.distanceReliable, true);
        assert.ok(leg.distanceKm > 0);
      }
    }
  }
});

test('24. Nationwide False Interchange & Route Validation Regression Suite (ROU -> UD, SRR vs TCR/OTP, Stop-Sequence & Multi-Route Audit)', () => {
  // A. Exact station identity: ROU != SRR, SRR != TCR, SRR != OTP
  assert.equal(areStationsStrictlyIdentical('ROU', 'ROU'), true);
  assert.equal(areStationsStrictlyIdentical('SRR', 'SRR'), true);
  assert.equal(areStationsStrictlyIdentical('ROU', 'SRR'), false);
  assert.equal(areStationsStrictlyIdentical('SRR', 'TCR'), false);
  assert.equal(areStationsStrictlyIdentical('SRR', 'OTP'), false);
  assert.equal(areStationsStrictlyIdentical('TCR', 'OTP'), false);
  assert.equal(areStationsStrictlyIdentical('ROU', 'ROP'), false);
  assert.equal(areStationsStrictlyIdentical('ROU', 'BPO'), false);

  const rouStation = getStationByCode(normalizedStations, 'ROU')!;
  const srrStation = getStationByCode(normalizedStations, 'SRR')!;
  const tcrStation = getStationByCode(normalizedStations, 'TCR')!;
  const otpStation = getStationByCode(normalizedStations, 'OTP')!;
  const udStation = getStationByCode(normalizedStations, 'UD')!;
  assert.ok(rouStation && srrStation && tcrStation && otpStation && udStation);
  assert.notEqual(srrStation.code, tcrStation.code);
  assert.notEqual(srrStation.code, otpStation.code);
  assert.equal(
    srrStation.aliases.some((a) => a.includes('thrissur') || a.includes('ottappalam')),
    false
  );
  assert.equal(
    tcrStation.aliases.some((a) => a.includes('shoranur') || a.includes('ottappalam')),
    false
  );
  assert.equal(
    otpStation.aliases.some((a) => a.includes('shoranur') || a.includes('thrissur')),
    false
  );

  // Exact search by station code or name never substitutes a nearby station
  assert.equal(searchStations(normalizedStations, 'SRR', 5)[0].code, 'SRR');
  assert.equal(searchStations(normalizedStations, 'TCR', 5)[0].code, 'TCR');
  assert.equal(searchStations(normalizedStations, 'OTP', 5)[0].code, 'OTP');
  assert.equal(searchStations(normalizedStations, 'UD', 5)[0].code, 'UD');

  // B. Actual train-stop validation:
  // A train calling at ROU and TCR (e.g. 13351 / 18189 via the Shoranur B-Cabin bypass chord)
  // cannot qualify as ROU -> SRR, and findDirectTrains('ROU', 'SRR', ...) must return 0 trains.
  const train13351 = nationwideGraph.trainByNumber.get('13351')!;
  const train18189 = nationwideGraph.trainByNumber.get('18189')!;
  assert.ok(train13351 && train18189);
  assert.ok(train13351.stops.some((s) => s.stationCode === 'ROU'));
  assert.ok(train13351.stops.some((s) => s.stationCode === 'PGT'));
  assert.ok(train13351.stops.some((s) => s.stationCode === 'TCR'));
  assert.equal(
    train13351.stops.some((s) => s.stationCode === 'SRR'),
    false,
    'Train 13351 bypasses Shoranur Junction via B-Cabin chord and must not list SRR as a commercial passenger stop'
  );
  assert.equal(
    train18189.stops.some((s) => s.stationCode === 'SRR'),
    false,
    'Train 18189 bypasses Shoranur Junction via B-Cabin chord and must not list SRR as a commercial passenger stop'
  );

  const directRouSrr = findDirectTrains('ROU', 'SRR', '2026-10-29', nationwideTrains);
  assert.equal(
    directRouSrr.length,
    0,
    'There must be zero direct commercial trains between ROU and SRR'
  );

  // Confirm that a fabricated leg claiming 13351 serves ROU -> SRR is rejected by validateTrainLegWithReason
  const rouStop13351 = train13351.stops.find((s) => s.stationCode === 'ROU')!;
  const tcrStop13351 = train13351.stops.find((s) => s.stationCode === 'TCR')!;
  const validRouTcrLeg = buildRouteLegOption(
    0,
    train13351,
    rouStop13351,
    tcrStop13351,
    '2026-10-29'
  );
  assert.equal(validateTrainLegWithReason(validRouTcrLeg, nationwideTrains).valid, true);

  const forgedRouSrrLeg = {
    ...validRouTcrLeg,
    toStationCode: 'SRR',
    toStationName: 'Shoranur Junction',
  };
  const forgedAudit = validateTrainLegWithReason(forgedRouSrrLeg, nationwideTrains);
  assert.equal(forgedAudit.valid, false);
  assert.equal(verifyTrainLegAgainstTimetable(forgedRouSrrLeg, nationwideTrains), false);

  // C & D. Multi-route validation for ROU -> UD:
  // Confirm the invalid ROU -> SRR -> UD route (and any corridor-reversal overshoot like ROU -> TCR -> UD) is rejected,
  // and only genuine, verified multi-leg routes with full traceability are returned.
  const rouToUd = findMultiRoutes({
    fromCode: 'ROU',
    toCode: 'UD',
    journeyDate: '2026-10-29',
    targetBufferMinutes: 180,
    maxDetourPct: 100,
    includeTighterConnections: true,
    stationsDirectory: normalizedStations,
    trains: nationwideTrains,
  });

  assert.equal(rouToUd.directTrainsCount, 0);
  assert.ok(rouToUd.routes.length >= 4, 'Expected verified connecting routes for ROU -> UD');

  // Verify ROU -> SRR -> UD and ROU -> TCR -> UD are completely absent
  assert.equal(
    rouToUd.routes.some((r) => r.stationSequence.includes('SRR')),
    false,
    'Invalid route ROU -> SRR -> UD must be rejected'
  );
  assert.equal(
    rouToUd.routes.some((r) => r.stationSequence.includes('TCR')),
    false,
    'Overshoot reversal route ROU -> TCR -> UD must be rejected'
  );

  // Verify genuine Western/Konkan interchanges (e.g., ROU -> BSL -> UD, ROU -> LTT -> UD) are present
  const routeIds = rouToUd.routes.map((r) => r.routeId);
  assert.ok(
    routeIds.includes('ROU->BSL->UD') || routeIds.includes('ROU->LTT->UD'),
    `Expected genuine Konkan feeder interchanges (BSL or LTT), got: ${routeIds.join(', ')}`
  );

  // Audit every leg and interchange of every returned ROU -> UD route
  for (const route of rouToUd.routes) {
    const audit = validateMultiRouteCandidate(route, nationwideTrains, 35);
    assert.equal(
      audit.valid,
      true,
      `Route ${route.routeId} failed validation: ${audit.reason}`
    );

    for (let i = 0; i < route.selectedLegs.length; i++) {
      const leg = route.selectedLegs[i];
      const trace = leg.traceableSourceRecord!;
      assert.ok(trace, `Leg ${i + 1} on ${route.routeId} must retain traceableSourceRecord`);
      assert.equal(trace.trainNumber, leg.trainNumber);
      assert.equal(trace.trainName, leg.trainName);
      assert.equal(trace.boardingStationCode, leg.fromStationCode);
      assert.equal(trace.destinationStationCode, leg.toStationCode);
      assert.ok(
        trace.originStopSequence >= 1 &&
          trace.destinationStopSequence > trace.originStopSequence
      );
      assert.ok(
        Array.isArray(trace.orderedStopSequence) &&
          trace.orderedStopSequence.length >= 2 &&
          trace.orderedStopSequence[0] === leg.fromStationCode &&
          trace.orderedStopSequence[trace.orderedStopSequence.length - 1] === leg.toStationCode
      );
      assert.equal(trace.scheduledDepartureTime, leg.departureTime);
      assert.equal(trace.scheduledArrivalTime, leg.arrivalTime);
      assert.equal(trace.operatingDayVerified, true);
      assert.equal(trace.validationResult, 'VERIFIED');
    }

    for (let i = 0; i < route.transfers.length; i++) {
      const tx = route.transfers[i];
      assert.equal(tx.interchangeStationCode, route.selectedLegs[i].toStationCode);
      assert.equal(tx.interchangeStationCode, route.selectedLegs[i + 1].fromStationCode);
      assert.ok(tx.scheduledLayoverMinutes >= 35);
    }
  }
});





