import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  ShieldAlert,
  RefreshCw,
  SlidersHorizontal,
  ArrowRight,
  GitCommit,
} from 'lucide-react';
import { TwoTrainComparisonResult } from '../types/railway';
import { TRAIN_SERVICES } from '../data/railwayDataset';
import { compareTwoTrainsLive, formatDuration } from '../lib/routingEngine';

interface CompareTrainsViewProps {
  initialIncomingTrain: string;
  initialOutgoingTrain: string;
  initialConnectingStation?: string;
  journeyDate: string;
  targetBufferMinutes: number;
}

export const CompareTrainsView: React.FC<CompareTrainsViewProps> = ({
  initialIncomingTrain,
  initialOutgoingTrain,
  initialConnectingStation,
  journeyDate,
  targetBufferMinutes,
}) => {
  const [incomingTrainNum, setIncomingTrainNum] = useState(
    initialIncomingTrain || '18008'
  );
  const [outgoingTrainNum, setOutgoingTrainNum] = useState(
    initialOutgoingTrain || '08043'
  );
  const [connectingStation, setConnectingStation] = useState<string | undefined>(
    initialConnectingStation || 'KGP'
  );
  const [incomingDelayOverride, setIncomingDelayOverride] = useState<
    number | undefined
  >(undefined);
  const [outgoingDelayOverride, setOutgoingDelayOverride] = useState<
    number | undefined
  >(undefined);
  const [comparison, setComparison] = useState<TwoTrainComparisonResult | null>(
    null
  );
  const [lastUpdated, setLastUpdated] = useState<string>(
    new Date().toLocaleTimeString()
  );

  const [trainOptions, setTrainOptions] = useState<
    Array<{ trainNumber: string; trainName: string }>
  >(() =>
    TRAIN_SERVICES.map((t) => ({
      trainNumber: t.trainNumber,
      trainName: t.trainName,
    }))
  );

  useEffect(() => {
    fetch('/api/trains/list?limit=150')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.trains) && data.trains.length > 0) {
          setTrainOptions(data.trains);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (initialIncomingTrain) setIncomingTrainNum(initialIncomingTrain);
    if (initialOutgoingTrain) setOutgoingTrainNum(initialOutgoingTrain);
    if (initialConnectingStation) setConnectingStation(initialConnectingStation);
    setIncomingDelayOverride(undefined);
    setOutgoingDelayOverride(undefined);
  }, [initialIncomingTrain, initialOutgoingTrain, initialConnectingStation]);

  useEffect(() => {
    const params = new URLSearchParams({
      incoming: incomingTrainNum,
      outgoing: outgoingTrainNum,
      date: journeyDate,
      buffer: String(targetBufferMinutes),
    });
    if (connectingStation) params.set('station', connectingStation);
    if (incomingDelayOverride !== undefined) {
      params.set('incomingDelay', String(incomingDelayOverride));
    }
    if (outgoingDelayOverride !== undefined) {
      params.set('outgoingDelay', String(outgoingDelayOverride));
    }

    fetch(`/api/trains/compare?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: TwoTrainComparisonResult | null) => {
        if (data) {
          setComparison(data);
        } else {
          setComparison(
            compareTwoTrainsLive({
              incomingTrainNumber: incomingTrainNum,
              outgoingTrainNumber: outgoingTrainNum,
              journeyDate,
              connectingStationCode: connectingStation,
              incomingDelayOverride,
              outgoingDelayOverride,
              targetBufferMinutes,
              trains: TRAIN_SERVICES,
            })
          );
        }
        setLastUpdated(new Date().toLocaleTimeString());
      })
      .catch(() => {
        setComparison(
          compareTwoTrainsLive({
            incomingTrainNumber: incomingTrainNum,
            outgoingTrainNumber: outgoingTrainNum,
            journeyDate,
            connectingStationCode: connectingStation,
            incomingDelayOverride,
            outgoingDelayOverride,
            targetBufferMinutes,
            trains: TRAIN_SERVICES,
          })
        );
        setLastUpdated(new Date().toLocaleTimeString());
      });
  }, [
    incomingTrainNum,
    outgoingTrainNum,
    journeyDate,
    connectingStation,
    incomingDelayOverride,
    outgoingDelayOverride,
    targetBufferMinutes,
  ]);

  const handlePresetPair = (inc: string, out: string, st: string) => {
    setIncomingTrainNum(inc);
    setOutgoingTrainNum(out);
    setConnectingStation(st);
    setIncomingDelayOverride(undefined);
    setOutgoingDelayOverride(undefined);
  };

  return (
    <div className="space-y-5">
      {/* Top Selection & Preset Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Compare Two Trains Live — Interchange Connection Risk Monitor
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <span>
                Track incoming arrival delay against outgoing departure at your connecting station
              </span>
              <span aria-hidden="true"> · </span>
              <span>Updated: {lastUpdated}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-slate-500">Quick Interchange Presets:</span>
            <button
              type="button"
              onClick={() => handlePresetPair('18008', '08043', 'KGP')}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-lg cursor-pointer"
            >
              KGP (ROP→BSB): 18008 → 08043
            </button>
            <button
              type="button"
              onClick={() => handlePresetPair('18646', '13005', 'HWH')}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-lg cursor-pointer"
            >
              HWH (ROP→BSB): 18646 → 13005
            </button>
            <button
              type="button"
              onClick={() => handlePresetPair('18008', '12834', 'KGP')}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-lg cursor-pointer"
            >
              KGP (ROP→ROU): 18008 → 12834
            </button>
            <button
              type="button"
              onClick={() => handlePresetPair('12832', '11046', 'DHN')}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-medium rounded-lg cursor-pointer"
            >
              DHN (ROU→BSB): 12832 → 11046
            </button>
          </div>
        </div>

        {/* Selectors Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label
              htmlFor="compare-incoming-select"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              1. Incoming Train (Leg 1)
            </label>
            <select
              id="compare-incoming-select"
              value={incomingTrainNum}
              onChange={(e) => {
                setIncomingTrainNum(e.target.value);
                setConnectingStation(undefined);
                setIncomingDelayOverride(undefined);
              }}
              className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-900"
            >
              {comparison &&
                !trainOptions.some(
                  (t) => t.trainNumber === comparison.incomingTrain.trainNumber
                ) && (
                  <option value={comparison.incomingTrain.trainNumber}>
                    {comparison.incomingTrain.trainNumber} —{' '}
                    {comparison.incomingTrain.trainName}
                  </option>
                )}
              {trainOptions.map((t) => (
                <option key={t.trainNumber} value={t.trainNumber}>
                  {t.trainNumber} — {t.trainName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="compare-outgoing-select"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              2. Outgoing Connecting Train (Leg 2)
            </label>
            <select
              id="compare-outgoing-select"
              value={outgoingTrainNum}
              onChange={(e) => {
                setOutgoingTrainNum(e.target.value);
                setConnectingStation(undefined);
                setOutgoingDelayOverride(undefined);
              }}
              className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-900"
            >
              {comparison &&
                !trainOptions.some(
                  (t) => t.trainNumber === comparison.outgoingTrain.trainNumber
                ) && (
                  <option value={comparison.outgoingTrain.trainNumber}>
                    {comparison.outgoingTrain.trainNumber} —{' '}
                    {comparison.outgoingTrain.trainName}
                  </option>
                )}
              {trainOptions.map((t) => (
                <option key={t.trainNumber} value={t.trainNumber}>
                  {t.trainNumber} — {t.trainName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="compare-station-select"
              className="block text-xs font-medium text-slate-600 mb-1.5"
            >
              3. Connecting Interchange Station
            </label>
            <select
              id="compare-station-select"
              value={comparison?.connectingStationCode || ''}
              onChange={(e) => setConnectingStation(e.target.value)}
              className="w-full h-11 px-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-900"
            >
              {comparison && comparison.commonStations.length > 0 ? (
                comparison.commonStations.map((st) => (
                  <option key={st.code} value={st.code}>
                    {st.name} — {st.code} (Auto-Detected Shared Stop)
                  </option>
                ))
              ) : (
                <option value={comparison?.connectingStationCode || 'RNC'}>
                  {comparison?.connectingStationName || 'Ranchi'} (
                  {comparison?.connectingStationCode || 'RNC'})
                </option>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Central Live Connection Risk Assessment Banner */}
      {comparison && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <GitCommit className="w-4 h-4 text-blue-900" />
                <span>
                  Interchange Station:{' '}
                  <strong className="text-slate-900">
                    {comparison.connectingStationName} ({comparison.connectingStationCode})
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono text-amber-800 font-semibold">
                  ₹0 Offline Mode — Scheduled Timetable Comparison (Live GPS Status Unavailable)
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-1">
                {(comparison.riskLevel === 'SAFE' ||
                  comparison.riskLevel === 'UNKNOWN') && (
                  <span className="inline-flex items-center gap-1.5 text-lg font-bold text-slate-800">
                    <CheckCircle2 className="w-5 h-5 text-blue-900" />
                    <span>{comparison.comparisonStatus}</span>
                  </span>
                )}
                {comparison.riskLevel === 'CAUTION' && (
                  <span className="inline-flex items-center gap-1.5 text-lg font-bold text-amber-700">
                    <AlertTriangle className="w-5 h-5" />
                    <span>{comparison.comparisonStatus}</span>
                  </span>
                )}
                {(comparison.riskLevel === 'HIGH_RISK' ||
                  comparison.riskLevel === 'MISSED') && (
                  <span className="inline-flex items-center gap-1.5 text-lg font-bold text-red-700">
                    <ShieldAlert className="w-5 h-5" />
                    <span>{comparison.comparisonStatus}</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">
                {comparison.explanation}
              </p>
            </div>

            <div className="flex items-center gap-5 shrink-0">
              <div className="text-right">
                <div className="text-xs text-slate-500">Scheduled Layover</div>
                <div className="font-mono text-lg font-bold text-slate-700 tabular-nums">
                  {formatDuration(comparison.scheduledLayoverMinutes)}
                </div>
              </div>

              <div className="pl-4 border-l border-slate-200 text-right">
                <div className="text-xs text-slate-500">Remaining Transfer Time</div>
                <div
                  className={`font-mono text-2xl font-bold tabular-nums ${
                    comparison.remainingTransferMinutes < 15
                      ? 'text-red-700'
                      : comparison.remainingTransferMinutes < 60
                      ? 'text-amber-700'
                      : 'text-emerald-700'
                  }`}
                >
                  {comparison.remainingTransferMinutes >= 0
                    ? formatDuration(comparison.remainingTransferMinutes)
                    : `Missed by ${Math.abs(comparison.remainingTransferMinutes)}m`}
                </div>
              </div>
            </div>
          </div>

          {/* Side-by-Side Incoming vs Outgoing Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-11 gap-4 items-stretch">
            {/* Incoming Train Card */}
            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>INCOMING TRAIN (LEG 1)</span>
                  <span className="font-mono">
                    Platform #{comparison.incomingPlatform} at {comparison.connectingStationCode}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="font-mono text-base font-bold text-blue-900">
                    {comparison.incomingTrain.trainNumber}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    {comparison.incomingTrain.trainName}
                  </h3>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  {comparison.incomingTrain.statusNote}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-200 text-xs">
                <div>
                  <div className="text-slate-500">Sched Arrival</div>
                  <div className="font-mono text-base font-bold text-slate-900 mt-0.5">
                    {comparison.scheduledArrivalTime}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">What-If Delay</div>
                  <div
                    className={`font-mono text-base font-bold mt-0.5 ${
                      comparison.incomingDelayMinutes > 15
                        ? 'text-amber-700'
                        : 'text-emerald-700'
                    }`}
                  >
                    +{comparison.incomingDelayMinutes}m
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Projected Arr</div>
                  <div className="font-mono text-base font-bold text-blue-900 mt-0.5">
                    {comparison.projectedArrivalTime}
                  </div>
                </div>
              </div>

              {/* Interactive Incoming Delay Slider */}
              <div className="pt-3 border-t border-slate-200 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-slate-700 flex items-center gap-1">
                    <SlidersHorizontal className="w-3.5 h-3.5 text-blue-900" />
                    <span>Manual What-If Delay Calculator:</span>
                  </span>
                  <span className="font-mono font-bold text-blue-900">
                    +{comparison.incomingDelayMinutes} min
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={300}
                  step={5}
                  value={comparison.incomingDelayMinutes}
                  aria-label="Simulate incoming train delay in minutes"
                  onChange={(e) => setIncomingDelayOverride(Number(e.target.value))}
                  className="w-full accent-blue-900 cursor-pointer"
                />
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>On Time (0m)</span>
                  <span>+45m</span>
                  <span>+120m</span>
                  <span>+240m</span>
                  <span>+300m</span>
                </div>
              </div>
            </div>

            {/* Center Transfer Bridge */}
            <div className="lg:col-span-1 flex flex-col items-center justify-center py-2 text-center">
              <div className="font-mono text-xs font-bold text-blue-900">
                {comparison.connectingStationCode}
              </div>
              <div className="my-1.5 w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center">
                <ArrowRight className="w-4 h-4 text-blue-900" />
              </div>
              <div className="text-[11px] font-mono text-slate-600">
                PF #{comparison.incomingPlatform} → PF #{comparison.outgoingPlatform}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Min {comparison.platformTransferMarginMinutes}m walk
              </div>
            </div>

            {/* Outgoing Train Card */}
            <div className="lg:col-span-5 bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>OUTGOING CONNECTING TRAIN (LEG 2)</span>
                  <span className="font-mono">
                    Platform #{comparison.outgoingPlatform} at {comparison.connectingStationCode}
                  </span>
                </div>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="font-mono text-base font-bold text-blue-900">
                    {comparison.outgoingTrain.trainNumber}
                  </span>
                  <h3 className="text-base font-bold text-slate-900">
                    {comparison.outgoingTrain.trainName}
                  </h3>
                </div>
                <div className="text-xs text-slate-600 mt-1">
                  {comparison.outgoingTrain.statusNote}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2 pt-3 border-t border-slate-200 text-xs">
                <div>
                  <div className="text-slate-500">Sched Departure</div>
                  <div className="font-mono text-base font-bold text-slate-900 mt-0.5">
                    {comparison.scheduledDepartureTime}
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Current Delay</div>
                  <div className="font-mono text-base font-bold text-slate-800 mt-0.5">
                    +{comparison.outgoingDelayMinutes}m
                  </div>
                </div>
                <div>
                  <div className="text-slate-500">Projected Dep</div>
                  <div className="font-mono text-base font-bold text-blue-900 mt-0.5">
                    {comparison.projectedDepartureTime}
                  </div>
                </div>
              </div>

              {/* Historical Context & Reset */}
              <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
                <div>
                  {comparison.historicalStatsAtConnection.available ? (
                    <span>
                      Incoming 30d History at {comparison.connectingStationCode}: Median{' '}
                      <strong className="font-mono">
                        {comparison.historicalStatsAtConnection.medianDelayMinutes}m
                      </strong>{' '}
                      · P90{' '}
                      <strong className="font-mono">
                        {comparison.historicalStatsAtConnection.p90DelayMinutes}m
                      </strong>
                    </span>
                  ) : (
                    <span>Historical delay data unavailable for incoming train</span>
                  )}
                </div>

                {incomingDelayOverride !== undefined && (
                  <button
                    type="button"
                    onClick={() => setIncomingDelayOverride(undefined)}
                    className="text-blue-900 font-semibold hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Reset Delay</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
