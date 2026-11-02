import React, { useState, useEffect } from 'react';
import {
  Activity,
  RefreshCw,
  Clock,
  Navigation,
  AlertCircle,
  CheckCircle2,
  SlidersHorizontal,
} from 'lucide-react';
import { LiveTrainStatus } from '../types/railway';
import { TRAIN_SERVICES } from '../data/railwayDataset';
import { getLiveTrainStatus } from '../lib/routingEngine';

interface LiveStatusViewProps {
  initialTrainNumber: string;
  journeyDate: string;
  onSelectTrainForComparison: (trainNumber: string) => void;
}

interface TrainListEntry {
  trainNumber: string;
  trainName: string;
  originCode: string;
  destinationCode: string;
}

export const LiveStatusView: React.FC<LiveStatusViewProps> = ({
  initialTrainNumber,
  journeyDate,
  onSelectTrainForComparison,
}) => {
  const [selectedTrainNumber, setSelectedTrainNumber] = useState(
    initialTrainNumber || '13352'
  );
  const [trainSearchQuery, setTrainSearchQuery] = useState('');
  const [trainDirectory, setTrainDirectory] = useState<TrainListEntry[]>(() =>
    TRAIN_SERVICES.map((t) => ({
      trainNumber: t.trainNumber,
      trainName: t.trainName,
      originCode: t.originCode,
      destinationCode: t.destinationCode,
    }))
  );
  const [simulatedDelay, setSimulatedDelay] = useState<number | undefined>(
    undefined
  );
  const [liveStatus, setLiveStatus] = useState<LiveTrainStatus | null>(null);
  const [lastRefreshed, setLastRefreshed] = useState<string>(
    new Date().toLocaleTimeString()
  );

  useEffect(() => {
    if (initialTrainNumber) {
      setSelectedTrainNumber(initialTrainNumber);
      setSimulatedDelay(undefined);
    }
  }, [initialTrainNumber]);

  // Fetch matching nationwide trains from /api/trains/list
  useEffect(() => {
    const qParam = trainSearchQuery.trim()
      ? `?q=${encodeURIComponent(trainSearchQuery.trim())}&limit=100`
      : '?limit=100';
    fetch(`/api/trains/list${qParam}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data && Array.isArray(data.trains) && data.trains.length > 0) {
          setTrainDirectory(data.trains);
        }
      })
      .catch(() => {});
  }, [trainSearchQuery]);

  const fetchTrainStatus = (trainNum: string, date: string, delay?: number) => {
    const delayQuery = delay !== undefined ? `&delay=${delay}` : '';
    fetch(
      `/api/trains/${encodeURIComponent(trainNum)}/live?date=${encodeURIComponent(date)}${delayQuery}`
    )
      .then((r) => (r.ok ? r.json() : null))
      .then((data: LiveTrainStatus | null) => {
        if (data) {
          setLiveStatus(data);
        } else {
          setLiveStatus(
            getLiveTrainStatus(trainNum, date, delay, TRAIN_SERVICES)
          );
        }
        setLastRefreshed(new Date().toLocaleTimeString());
      })
      .catch(() => {
        setLiveStatus(
          getLiveTrainStatus(trainNum, date, delay, TRAIN_SERVICES)
        );
        setLastRefreshed(new Date().toLocaleTimeString());
      });
  };

  useEffect(() => {
    fetchTrainStatus(selectedTrainNumber, journeyDate, simulatedDelay);
  }, [selectedTrainNumber, journeyDate, simulatedDelay]);

  const handleManualRefresh = () => {
    fetchTrainStatus(selectedTrainNumber, journeyDate, simulatedDelay);
  };

  return (
    <div className="space-y-5">
      {/* Train Selector & Provenance Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Live Train Running Status &amp; Station Timeline
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              <span>Distinguishes scheduled timetable events from reported/simulated delays</span>
              <span aria-hidden="true"> · </span>
              <span>Last refreshed: {lastRefreshed}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-mono font-semibold text-amber-800 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-lg">
              ₹0 OFFLINE MODE — LIVE GPS STATUS UNAVAILABLE (SHOWING SCHEDULED TIMETABLE)
            </span>
          </div>
        </div>

        {/* Train Picker & Delay Simulator */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="live-train-filter"
                className="block text-xs font-medium text-slate-600 mb-1.5"
              >
                Filter Nationwide Trains (5,190+ Trains)
              </label>
              <input
                id="live-train-filter"
                type="text"
                value={trainSearchQuery}
                onChange={(e) => setTrainSearchQuery(e.target.value)}
                placeholder="Type train # or name (e.g. 18008, Gitanjali)..."
                className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-900"
              />
            </div>
            <div>
              <label
                htmlFor="live-train-select"
                className="block text-xs font-medium text-slate-600 mb-1.5"
              >
                Select Active Train
              </label>
              <select
                id="live-train-select"
                value={selectedTrainNumber}
                onChange={(e) => {
                  setSelectedTrainNumber(e.target.value);
                  setSimulatedDelay(undefined);
                }}
                className="w-full h-11 px-3.5 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-900 focus:outline-none focus:border-blue-900"
              >
                {liveStatus &&
                  !trainDirectory.some(
                    (t) => t.trainNumber === liveStatus.trainNumber
                  ) && (
                    <option value={liveStatus.trainNumber}>
                      {liveStatus.trainNumber} — {liveStatus.trainName}
                    </option>
                  )}
                {trainDirectory.map((t) => (
                  <option key={t.trainNumber} value={t.trainNumber}>
                    {t.trainNumber} — {t.trainName} ({t.originCode} → {t.destinationCode})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleManualRefresh}
              className="h-11 px-4 bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Refresh Timetable</span>
            </button>

            <button
              type="button"
              onClick={() => onSelectTrainForComparison(selectedTrainNumber)}
              className="h-11 px-4 bg-blue-900 hover:bg-blue-800 text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Activity className="w-4 h-4" />
              <span>Compare in 2-Train Monitor</span>
            </button>
          </div>
        </div>

        {/* Interactive What-If Delay Calculator for Testing Connection & Arrival Impact */}
        {liveStatus && (
          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 p-3.5 rounded-lg">
            <div className="flex items-center gap-2 text-xs text-slate-700">
              <SlidersHorizontal className="w-4 h-4 text-blue-900 shrink-0" />
              <span>
                <strong>Manual What-If Delay Calculator (Offline Tool):</strong> Test how a hypothetical delay shifts scheduled station arrivals:
              </span>
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={0}
                max={240}
                step={5}
                value={liveStatus.currentDelayMinutes}
                aria-label="Hypothetical delay in minutes"
                onChange={(e) => setSimulatedDelay(Number(e.target.value))}
                className="w-36 sm:w-48 accent-blue-900 cursor-pointer"
              />
              <span className="font-mono text-xs font-bold text-blue-900 w-20 text-right">
                +{liveStatus.currentDelayMinutes} min
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Live Status Timeline Card */}
      {liveStatus && (
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-bold text-blue-900">
                  {liveStatus.trainNumber}
                </span>
                <h3 className="text-lg font-bold text-slate-900">
                  {liveStatus.trainName}
                </h3>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                {liveStatus.statusNote}
                {liveStatus.nextStationName && (
                  <>
                    {' '}
                    · Next Scheduled Stop: <strong>{liveStatus.nextStationName} ({liveStatus.nextStationCode})</strong>
                  </>
                )}
              </p>
            </div>

            <div className="flex items-center gap-4">
              {liveStatus.currentDelayMinutes === 0 ? (
                <div className="flex items-center gap-1.5 text-slate-700 font-semibold text-sm">
                  <CheckCircle2 className="w-4 h-4 text-blue-900" />
                  <span>Live Status Unavailable — Showing Scheduled Timetable</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-amber-700 font-semibold text-sm">
                  <AlertCircle className="w-4 h-4" />
                  <span>What-If Delay Applied: +{liveStatus.currentDelayMinutes} minutes</span>
                </div>
              )}
            </div>
          </div>

          {/* Station-by-Station Timeline Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-medium">
                  <th className="py-2.5 pr-3">Status</th>
                  <th className="py-2.5 px-3">Station</th>
                  <th className="py-2.5 px-3 font-mono">Code</th>
                  <th className="py-2.5 px-3 text-right font-mono">PF</th>
                  <th className="py-2.5 px-3 text-right font-mono">Dist</th>
                  <th className="py-2.5 px-3 text-right font-mono">Sched Arr</th>
                  <th className="py-2.5 px-3 text-right font-mono">Expected Arr</th>
                  <th className="py-2.5 px-3 text-right font-mono">Sched Dep</th>
                  <th className="py-2.5 pl-3 text-right font-mono">Expected Dep</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {liveStatus.events.map((ev) => {
                  const isCurrent = ev.status === 'ARRIVED';
                  const isDeparted = ev.status === 'DEPARTED';
                  return (
                    <tr
                      key={ev.stationCode}
                      className={
                        isCurrent
                          ? 'bg-blue-50/90 font-semibold text-slate-900'
                          : isDeparted
                          ? 'text-slate-400'
                          : 'text-slate-800 hover:bg-slate-50'
                      }
                    >
                      <td className="py-3 pr-3 whitespace-nowrap">
                        {isCurrent ? (
                          <span className="inline-flex items-center gap-1 text-blue-900 font-bold">
                            <Navigation className="w-3.5 h-3.5" />
                            <span>Current Station</span>
                          </span>
                        ) : isDeparted ? (
                          <span>Departed</span>
                        ) : ev.status === 'APPROACHING' ? (
                          <span className="text-amber-700 font-medium flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>Next Stop</span>
                          </span>
                        ) : (
                          <span>Upcoming</span>
                        )}
                      </td>
                      <td className="py-3 px-3">{ev.stationName}</td>
                      <td className="py-3 px-3 font-mono font-semibold text-blue-900">
                        {ev.stationCode}
                      </td>
                      <td className="py-3 px-3 text-right font-mono">#{ev.platform}</td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {ev.distanceKm} km
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {ev.scheduledArrival || 'Origin'}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums font-semibold">
                        {ev.expectedArrival ? (
                          <span
                            className={
                              ev.delayMinutes > 15 && !isDeparted
                                ? 'text-amber-700'
                                : ''
                            }
                          >
                            {ev.expectedArrival}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums">
                        {ev.scheduledDeparture || 'Dest'}
                      </td>
                      <td className="py-3 pl-3 text-right font-mono tabular-nums font-semibold">
                        {ev.expectedDeparture || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
