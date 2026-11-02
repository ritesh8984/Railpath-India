import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import {
  auditStationsDataset,
  normalizeStationsDataset,
  searchStations,
} from './src/lib/stationSearch';
import {
  compareTwoTrainsLive,
  evaluateCustomLegSelection,
  findDirectTrains,
  findMultiRoutes,
  getLiveTrainStatus,
  getRouteGraph,
} from './src/lib/routingEngine';
import {
  buildNationwideTrainServices,
  NationwideTimetablePayload,
} from './src/data/railwayDataset';
import { RawStationRecord } from './src/types/railway';

dotenv.config();

// Read port from environment variable (required by Cloud Run) with local 3000 fallback
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) || 3000 : 3000;

// Safe startup configuration: no environment variables or API keys are required.
// Defaults to "demo" when RAILWAY_DATA_MODE is unset or empty.
export function resolveRuntimeConfig(env: NodeJS.ProcessEnv = process.env) {
  const configuredMode = (env.RAILWAY_DATA_MODE || '').trim().toLowerCase();
  const dataMode = configuredMode || 'demo';

  // Default to the project's own data/Railway_stations.json using a reliable relative path.
  const defaultRelativePath = path.join('data', 'Railway_stations.json');
  const customEnvPath = (env.RAILWAY_STATION_DATA_PATH || '').trim();

  return {
    dataMode,
    defaultRelativePath,
    customEnvPath,
  };
}

// Load & validate the nationwide 8,938-station dataset from disk on server startup without crashing if missing
export function loadStationDataset(env: NodeJS.ProcessEnv = process.env): {
  raw: RawStationRecord[];
  sourcePath: string;
  missingFileHelp?: string;
} {
  const { defaultRelativePath, customEnvPath } = resolveRuntimeConfig(env);

  const candidatePaths = [
    path.resolve(process.cwd(), defaultRelativePath),
    customEnvPath ? path.resolve(process.cwd(), customEnvPath) : '',
    path.resolve(process.cwd(), 'public', 'assets', 'aistudio', 'Railway_stations_5ba03751.json'),
  ].filter(Boolean);

  for (const p of candidatePaths) {
    try {
      if (fs.existsSync(p)) {
        const content = fs.readFileSync(p, 'utf8');
        const parsed = JSON.parse(content);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return {
            raw: parsed as RawStationRecord[],
            sourcePath: path.relative(process.cwd(), p) || defaultRelativePath,
          };
        }
      }
    } catch (err) {
      console.warn(`[RailPath India] Warning reading station dataset at ${p}:`, err);
    }
  }

  const helpMessage =
    'Station dataset file (Railway_stations.json) was not found in ./data/Railway_stations.json. ' +
    'To add it: create a "data" folder in the project root and copy your Railway_stations.json file to "data/Railway_stations.json", then restart the server.';
  console.warn(`[RailPath India] ${helpMessage}`);

  return {
    raw: [],
    sourcePath: defaultRelativePath,
    missingFileHelp: helpMessage,
  };
}

// Load the normalized DataMeet CC0 nationwide timetable from ./data/nationwide_timetable.json
export function loadNationwideTimetable(): {
  payload: NationwideTimetablePayload | null;
  sourcePath: string;
  missingTimetableHelp?: string;
} {
  const relPath = path.join('data', 'nationwide_timetable.json');
  const absPath = path.resolve(process.cwd(), relPath);
  try {
    if (fs.existsSync(absPath)) {
      const content = fs.readFileSync(absPath, 'utf8');
      const parsed = JSON.parse(content) as NationwideTimetablePayload;
      if (parsed && Array.isArray(parsed.trains) && parsed.trains.length > 0) {
        return {
          payload: parsed,
          sourcePath: relPath,
        };
      }
    }
  } catch (err) {
    console.warn(`[RailPath India] Warning reading nationwide timetable at ${absPath}:`, err);
  }

  const helpMessage =
    'Nationwide timetable file (data/nationwide_timetable.json) was not found. ' +
    'Run "node scripts/buildNationwideTimetable.cjs" after placing DataMeet trains.json and schedules.json in data/, or place data/nationwide_timetable.json in ./data/.';
  console.warn(`[RailPath India] ${helpMessage}`);
  return {
    payload: null,
    sourcePath: relPath,
    missingTimetableHelp: helpMessage,
  };
}

interface InitializedServerData {
  runtimeConfig: ReturnType<typeof resolveRuntimeConfig>;
  stationSourcePath: string;
  stationMissingHelp?: string;
  normalizedStations: ReturnType<typeof normalizeStationsDataset>;
  nationwideTimetablePayload: NationwideTimetablePayload | null;
  timetableSourcePath: string;
  missingTimetableHelp?: string;
  nationwideTrainServices: ReturnType<typeof buildNationwideTrainServices>;
  routeGraph: ReturnType<typeof getRouteGraph>;
  stationAuditReport: ReturnType<typeof auditStationsDataset> & {
    dataMode?: string;
    missingFileHelp?: string;
  };
}

let cachedServerData: InitializedServerData | null = null;

export function getServerData(): InitializedServerData {
  if (cachedServerData) return cachedServerData;

  const runtimeConfig = resolveRuntimeConfig();
  const {
    raw: rawStationRecords,
    sourcePath: stationSourcePath,
    missingFileHelp: stationMissingHelp,
  } = loadStationDataset();
  const normalizedStations = normalizeStationsDataset(rawStationRecords);

  const {
    payload: nationwideTimetablePayload,
    sourcePath: timetableSourcePath,
    missingTimetableHelp,
  } = loadNationwideTimetable();

  const nationwideTrainServices = buildNationwideTrainServices(
    nationwideTimetablePayload,
    normalizedStations
  );

  const routeGraph = getRouteGraph(nationwideTrainServices);

  const baseAuditReport = auditStationsDataset(rawStationRecords, stationSourcePath);
  const stationAuditReport = {
    ...baseAuditReport,
    status: stationMissingHelp ? ('MISSING_FILE' as const) : baseAuditReport.status,
    dataMode: runtimeConfig.dataMode,
    missingFileHelp: stationMissingHelp,
  };

  cachedServerData = {
    runtimeConfig,
    stationSourcePath,
    stationMissingHelp,
    normalizedStations,
    nationwideTimetablePayload,
    timetableSourcePath,
    missingTimetableHelp,
    nationwideTrainServices,
    routeGraph,
    stationAuditReport,
  };

  return cachedServerData;
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // 1. Station Dataset Audit & Provenance Endpoint
  app.get('/api/stations/audit', (_req, res) => {
    const { stationAuditReport } = getServerData();
    res.json(stationAuditReport);
  });

  // 2. Nationwide Station Autocomplete Endpoint (8,938 stations)
  app.get('/api/stations/search', (req, res) => {
    const { normalizedStations, runtimeConfig, stationMissingHelp } = getServerData();
    const q = String(req.query.q || '');
    const limit = Math.min(50, Math.max(1, parseInt(String(req.query.limit || '15'), 10) || 15));
    const zone = req.query.zone ? String(req.query.zone) : undefined;
    const matches = searchStations(normalizedStations, q, limit, zone);
    res.json({
      query: q,
      totalDatasetStations: normalizedStations.length,
      count: matches.length,
      stations: matches,
      dataMode: runtimeConfig.dataMode,
      missingFileHelp: stationMissingHelp,
    });
  });

  // 3. Direct Train Discovery Endpoint
  app.get('/api/trains/direct', (req, res) => {
    const { nationwideTrainServices } = getServerData();
    const from = String(req.query.from || 'ROU').trim().toUpperCase();
    const to = String(req.query.to || 'BSB').trim().toUpperCase();
    const date = String(req.query.date || '2026-10-29').trim();

    if (!from || !to || from === to) {
      res.status(400).json({ error: 'Origin and destination station codes must be distinct.' });
      return;
    }

    const trains = findDirectTrains(from, to, date, nationwideTrainServices);
    res.json({
      fromCode: from,
      toCode: to,
      journeyDate: date,
      count: trains.length,
      trains,
      dataMode: 'SCHEDULE_ONLY',
    });
  });

  // 4. Automatic Multi-Route Discovery Endpoint
  app.get('/api/routes/multi', (req, res) => {
    const { normalizedStations, nationwideTrainServices } = getServerData();
    const from = String(req.query.from || 'ROU').trim().toUpperCase();
    const to = String(req.query.to || 'BSB').trim().toUpperCase();
    const date = String(req.query.date || '2026-10-29').trim();
    const targetBufferMinutes =
      parseInt(String(req.query.buffer || '180'), 10) || 180;
    const maxDetourPct =
      parseFloat(String(req.query.maxDetour || '25')) || 25;
    const includeTighterConnections = req.query.tighter === 'true';
    const maxLegs = req.query.maxLegs === '2' ? 2 : 3;

    if (!from || !to || from === to) {
      res.status(400).json({ error: 'Origin and destination station codes must be distinct.' });
      return;
    }

    const response = findMultiRoutes({
      fromCode: from,
      toCode: to,
      journeyDate: date,
      targetBufferMinutes,
      maxDetourPct,
      includeTighterConnections,
      maxLegs,
      stationsDirectory: normalizedStations,
      trains: nationwideTrainServices,
    });

    res.json(response);
  });

  // 5. Dynamic Custom Leg Re-evaluation Endpoint
  app.post('/api/routes/evaluate', (req, res) => {
    const { route, selectedLegs, targetBufferMinutes, liveDelayOverrides } = req.body || {};
    if (!route || !Array.isArray(selectedLegs)) {
      res.status(400).json({ error: 'Invalid route or selectedLegs payload.' });
      return;
    }
    const updated = evaluateCustomLegSelection({
      route,
      selectedLegs,
      targetBufferMinutes: Number(targetBufferMinutes) || 180,
      liveDelayOverrides,
    });
    res.json(updated);
  });

  // 6. All Trains Directory & Live Train Status Endpoint
  app.get('/api/trains/list', (req, res) => {
    const { nationwideTrainServices } = getServerData();
    const q = String(req.query.q || '').trim().toLowerCase();
    const limit = Math.min(200, Math.max(10, parseInt(String(req.query.limit || '100'), 10) || 100));
    const filtered = q
      ? nationwideTrainServices.filter(
          (t) =>
            t.trainNumber.toLowerCase().includes(q) ||
            t.trainName.toLowerCase().includes(q) ||
            t.originCode.toLowerCase() === q ||
            t.destinationCode.toLowerCase() === q
        )
      : nationwideTrainServices;

    res.json({
      totalCount: nationwideTrainServices.length,
      count: Math.min(limit, filtered.length),
      trains: filtered.slice(0, limit).map((t) => ({
        trainNumber: t.trainNumber,
        trainName: t.trainName,
        trainType: t.trainType,
        originCode: t.originCode,
        destinationCode: t.destinationCode,
        operatingDays: t.operatingDays,
        operatingDaysAvailable: t.operatingDaysAvailable !== false,
        defaultDemoDelayMinutes: 0,
      })),
    });
  });

  app.get('/api/trains/:trainNumber/live', (req, res) => {
    const { nationwideTrainServices } = getServerData();
    const trainNumber = String(req.params.trainNumber || '');
    const date = String(req.query.date || '2026-10-29');
    const delayParam = req.query.delay !== undefined ? Number(req.query.delay) : undefined;

    const status = getLiveTrainStatus(
      trainNumber,
      date,
      delayParam,
      nationwideTrainServices
    );
    if (!status) {
      res.status(404).json({ error: `Train "${trainNumber}" not found in local timetable dataset.` });
      return;
    }
    res.json(status);
  });

  // 7. Live Two-Train Comparison Endpoint
  app.get('/api/trains/compare', (req, res) => {
    const { nationwideTrainServices } = getServerData();
    const incoming = String(req.query.incoming || '18008');
    const outgoing = String(req.query.outgoing || '08043');
    const date = String(req.query.date || '2026-10-29');
    const station = req.query.station ? String(req.query.station) : undefined;
    const incDelay =
      req.query.incomingDelay !== undefined ? Number(req.query.incomingDelay) : undefined;
    const outDelay =
      req.query.outgoingDelay !== undefined ? Number(req.query.outgoingDelay) : undefined;
    const buffer =
      req.query.buffer !== undefined ? Number(req.query.buffer) : 180;

    const result = compareTwoTrainsLive({
      incomingTrainNumber: incoming,
      outgoingTrainNumber: outgoing,
      journeyDate: date,
      connectingStationCode: station,
      incomingDelayOverride: incDelay,
      outgoingDelayOverride: outDelay,
      targetBufferMinutes: buffer,
      trains: nationwideTrainServices,
    });

    if (!result) {
      res.status(404).json({ error: 'Could not compare the selected trains.' });
      return;
    }
    res.json(result);
  });

  // 8. Provider & Zero-Budget Local Mode Status Endpoint
  app.get('/api/providers/status', (_req, res) => {
    const {
      runtimeConfig,
      stationMissingHelp,
      stationSourcePath,
      normalizedStations,
      stationAuditReport,
      missingTimetableHelp,
      timetableSourcePath,
      nationwideTimetablePayload,
      nationwideTrainServices,
      routeGraph,
    } = getServerData();

    const hasOptionalLiveKey = Boolean(
      process.env.RAPIDAPI_IRCTC_KEY || process.env.NTES_PARTNER_API_KEY
    );
    res.json({
      budgetMode: 'ZERO_COST_LOCAL_MODE',
      dataMode: runtimeConfig.dataMode,
      stationDirectory: {
        status: stationMissingHelp ? 'MISSING_FILE' : 'ACTIVE_VERIFIED',
        source: stationSourcePath,
        recordsCount: normalizedStations.length,
        zonesCount: Object.keys(stationAuditReport.zoneDistribution).length,
        missingFileHelp: stationMissingHelp,
      },
      timetableCorridors: {
        status: missingTimetableHelp ? 'PARTIAL_CORRIDOR_FALLBACK' : 'NATIONWIDE_TIMETABLE_ACTIVE',
        source: timetableSourcePath,
        datasetName:
          nationwideTimetablePayload?.source ||
          'DataMeet Indian Railways Dataset (CC0 1.0 Public Domain) + OGD India Per-Stop Cumulative Distances',
        freshness:
          nationwideTimetablePayload?.freshness ||
          'Static Community Timetable Snapshot',
        trainsCount: nationwideTrainServices.length,
        activeTimetableStationsCount: routeGraph.trainsAtStation.size,
        missingTimetableHelp,
        note: 'Uses locally imported DataMeet CC0 nationwide Indian Railways timetable schedules enriched with verified per-stop cumulative distances (data/verified_stop_distances.json). No external API key required.',
      },
      liveRunningStatus: {
        mode: hasOptionalLiveKey ? 'LIVE_API_CONFIGURED' : 'UNAVAILABLE_OFFLINE_MODE',
        configuredProvider: runtimeConfig.dataMode,
        requiresExternalCredentials: false,
        missingEnvVars: [],
        note: 'Real-time train location and live delay feed are disabled in ₹0 budget mode. Scheduled timetable comparison and manual delay stress-testing remain active.',
      },
      historicalReliability: {
        mode: 'UNAVAILABLE_OFFLINE_MODE',
        note: 'Historical delay feed is disabled in ₹0 budget mode; recommendation engine automatically renormalizes weights without inventing punctuality data.',
      },
    });
  });

  // Mount Vite middleware in development or static dist in production
  const distPath = path.resolve(process.cwd(), 'dist');
  const distIndexExists = fs.existsSync(path.join(distPath, 'index.html'));
  const isProduction = process.env.NODE_ENV === 'production' || (distIndexExists && process.env.NODE_ENV !== 'development');

  if (!isProduction) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[RailPath India] Full-stack server listening on http://0.0.0.0:${PORT}`);
    // Warm up datasets asynchronously right after port 3000 is open
    setImmediate(() => {
      try {
        const data = getServerData();
        console.log(
          `[RailPath India] Datasets ready (mode="${data.runtimeConfig.dataMode}", ${data.normalizedStations.length} stations, ${data.nationwideTrainServices.length} trains)`
        );
      } catch (err) {
        console.error('[RailPath India] Error warming datasets:', err);
      }
    });
  });
}

if (!process.env.NODE_TEST_CONTEXT) {
  startServer();
}


