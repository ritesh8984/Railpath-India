/**
 * Build Script: Normalized Nationwide Timetable from DataMeet Indian Railways Dataset (CC0)
 * Sources:
 * - https://github.com/datameet/railways (trains.json, schedules.json) — CC0 1.0 Public Domain
 * - Preserves data/Railway_stations.json (8,938 stations)
 *
 * Strict Verification Rules:
 * 1. Only retains commercial passenger halts (arrival !== departure at intermediate stations, or origin/destination terminals).
 *    Never falls back to 0-minute passing rows (prevents non-stop Duronto passing points from appearing as stops).
 * 2. Never invents or interpolates per-stop distances using Haversine coordinates; only sets km=0 at origin and km=props.distance at final destination when present in DataMeet trains.json.
 * 3. Rejects trains with duplicate station codes, non-monotonic timestamps, or corrupted >5-day schedules.
 */
const fs = require('node:fs');
const path = require('node:path');

const CODE_RENAMES = {
  MGS: 'DDU',
  ALD: 'PRYJ',
  JHS: 'VGLJ',
  HBJ: 'RKMP',
  COI: 'PCOI',
  PNK: 'PNKD',
  MUV: 'BSBS',
  FD: 'AY',
  CSTM: 'CSMT',
};

function parseTimeToMinutes(hhmm) {
  if (!hhmm) return 0;
  const [h, m] = hhmm.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return 0;
  return h * 60 + m;
}

function build() {
  const dataDir = path.resolve(process.cwd(), 'data');
  const trainsGeo = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'datameet_trains.json'), 'utf8')
  );
  const schedules = JSON.parse(
    fs.readFileSync(path.join(dataDir, 'datameet_schedules.json'), 'utf8')
  );

  const trainPropsByNum = new Map();
  for (const f of trainsGeo.features || []) {
    if (f.properties?.number) {
      trainPropsByNum.set(String(f.properties.number).trim(), f);
    }
  }

  const rowsByTrain = new Map();
  for (const s of schedules) {
    const num = String(s.train_number || '').trim();
    if (!num) continue;
    if (!rowsByTrain.has(num)) rowsByTrain.set(num, []);
    rowsByTrain.get(num).push(s);
  }

  const normalizedTrains = [];

  for (const [num, rows] of rowsByTrain.entries()) {
    rows.sort((a, b) => a.id - b.id);
    const tf = trainPropsByNum.get(num);
    const props = tf?.properties || {};
    const totalDist =
      typeof props.distance === 'number' && props.distance > 0
        ? Math.round(props.distance)
        : null;

    // Filter rows to stops with arrival or departure timestamps
    const indexedRows = rows.filter((r) => {
      const noArr = !r.arrival || r.arrival === 'None';
      const noDep = !r.departure || r.departure === 'None';
      return !(noArr && noDep);
    });
    if (indexedRows.length < 2) continue;

    // Strictly retain only origin, final destination, and genuine commercial halts where arrival !== departure
    const commercialRows = indexedRows.filter((r, i) => {
      if (i === 0) return Boolean(r.departure && r.departure !== 'None');
      if (i === indexedRows.length - 1) return Boolean(r.arrival && r.arrival !== 'None');
      const hasArr = Boolean(r.arrival && r.arrival !== 'None');
      const hasDep = Boolean(r.departure && r.departure !== 'None');
      return hasArr && hasDep && r.arrival !== r.departure;
    });

    if (commercialRows.length < 2) continue;

    const stops = [];
    for (let i = 0; i < commercialRows.length; i++) {
      const r = commercialRows[i];
      const rawCode = String(r.station_code || '').trim().toUpperCase();
      if (!rawCode) continue;
      const code = CODE_RENAMES[rawCode] || rawCode;

      const arr =
        r.arrival && r.arrival !== 'None' ? String(r.arrival).slice(0, 5) : null;
      const dep =
        r.departure && r.departure !== 'None'
          ? String(r.departure).slice(0, 5)
          : null;

      stops.push({
        c: code,
        a: i === 0 ? null : arr,
        d: i === commercialRows.length - 1 ? null : dep,
        day: Math.max(1, Number(r.day) || 1),
        km:
          i === 0
            ? 0
            : i === commercialRows.length - 1 && totalDist !== null
            ? totalDist
            : null,
      });
    }

    if (stops.length < 2) continue;

    // Reject trains with duplicate station codes in their stop sequence
    const codes = stops.map((s) => s.c);
    if (new Set(codes).size !== codes.length) continue;

    // Enforce monotonic day offsets across midnight crossings
    let dayAdd = 0;
    for (let i = 1; i < stops.length; i++) {
      const prev = stops[i - 1];
      const curr = stops[i];
      curr.day += dayAdd;
      if (curr.day < prev.day) {
        dayAdd += prev.day - curr.day;
        curr.day = prev.day;
      }
      const prevDepMin = parseTimeToMinutes(prev.d || prev.a);
      const currArrMin = parseTimeToMinutes(curr.a || curr.d);
      if (curr.day === prev.day && currArrMin < prevDepMin - 5) {
        dayAdd += 1;
        curr.day += 1;
      }
    }

    const maxDay = Math.max(...stops.map((s) => s.day));
    if (maxDay > 5) continue;

    let monotonic = true;
    for (let i = 1; i < stops.length; i++) {
      const prev = stops[i - 1];
      const curr = stops[i];
      const prevAbs = (prev.day - 1) * 1440 + parseTimeToMinutes(prev.d || prev.a);
      const currAbs = (curr.day - 1) * 1440 + parseTimeToMinutes(curr.a || curr.d);
      if (currAbs <= prevAbs) {
        monotonic = false;
        break;
      }
      if (i < stops.length - 1) {
        let depAbs = (curr.day - 1) * 1440 + parseTimeToMinutes(curr.d);
        if (depAbs < currAbs) depAbs += 1440;
        if (depAbs <= currAbs) {
          monotonic = false;
          break;
        }
      }
    }
    if (!monotonic) continue;

    const classes = [];
    if (props.first_ac) classes.push('1A');
    if (props.second_ac) classes.push('2A');
    if (props.third_ac) classes.push('3A');
    if (props.chair_car) classes.push('CC');
    if (props.sleeper) classes.push('SL');
    if (props.first_class) classes.push('FC');
    if (classes.length === 0) classes.push('SL', '2S');

    normalizedTrains.push({
      n: num,
      name: String(props.name || rows[0].train_name || num).trim(),
      t: String(props.type || 'EXP').trim().toUpperCase(),
      dist: totalDist,
      cls: classes,
      s: stops,
    });
  }

  const payload = {
    source: 'DataMeet Indian Railways Dataset (https://github.com/datameet/railways)',
    license: 'CC0 1.0 Universal (Public Domain Dedication)',
    freshness: 'Static Community Archive (DataMeet schedules.json + trains.json; commercial halts only)',
    operatingDaysAvailable: false,
    perStopDistanceAvailable: false,
    trainsCount: normalizedTrains.length,
    trains: normalizedTrains,
  };

  const outPath = path.join(dataDir, 'nationwide_timetable.json');
  fs.writeFileSync(outPath, JSON.stringify(payload));
  console.log(
    `Built ${outPath} with ${normalizedTrains.length} trains (${(
      fs.statSync(outPath).size /
      (1024 * 1024)
    ).toFixed(2)} MB)`
  );
}

build();
