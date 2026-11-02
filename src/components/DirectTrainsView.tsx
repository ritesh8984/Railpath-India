import React, { useState } from 'react';
import {
  ArrowRight,
  Clock,
  GitBranch,
  Activity,
  AlertCircle,
  Calendar,
  ChevronDown,
  ChevronUp,
  Navigation,
} from 'lucide-react';
import { DirectTrainMatch, RouteDiagnostics } from '../types/railway';
import { formatDuration } from '../lib/routingEngine';

interface DirectTrainsViewProps {
  fromCode: string;
  fromName: string;
  toCode: string;
  toName: string;
  journeyDate: string;
  trains: DirectTrainMatch[];
  multiRoutesCount: number;
  diagnostics?: RouteDiagnostics;
  onSwitchToMultiRoutes: () => void;
  onOpenLiveStatus: (trainNumber: string) => void;
  onChangeDate: (newDate: string) => void;
}

export const DirectTrainsView: React.FC<DirectTrainsViewProps> = ({
  fromCode,
  fromName,
  toCode,
  toName,
  journeyDate,
  trains,
  multiRoutesCount,
  diagnostics,
  onSwitchToMultiRoutes,
  onOpenLiveStatus,
  onChangeDate,
}) => {
  const [expandedTrain, setExpandedTrain] = useState<string | null>(null);

  return (
    <div className="space-y-4 sm:space-y-5">
      {/* Direct Trains Summary Strip */}
      <div className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-2xl p-4 sm:p-5 rp-shadow-card flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="w-2 h-2 rounded-full bg-[#15803D]"
            />
            <h2 className="text-sm sm:text-base font-bold text-[#17243B]">
              Direct Trains: {fromName} ({fromCode}) → {toName} ({toCode})
            </h2>
          </div>
          <p className="text-xs text-[#64748B] mt-1 flex flex-wrap items-center gap-1.5">
            <span>Date: {journeyDate}</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono font-medium text-[#17243B]">
              {trains.length} direct service{trains.length === 1 ? '' : 's'} operating
            </span>
            <span aria-hidden="true">·</span>
            <span>Indian Standard Time (IST)</span>
          </p>
        </div>

        {multiRoutesCount > 0 && (
          <button
            type="button"
            onClick={onSwitchToMultiRoutes}
            className="px-3.5 py-2 text-xs font-semibold text-[#2447A8] hover:text-[#1D3B8E] bg-[#F8FAFC] hover:bg-[#EEF2F7] border border-[#E6EAF0] rounded-xl transition-colors inline-flex items-center gap-2 self-start sm:self-auto cursor-pointer shrink-0"
          >
            <GitBranch className="w-3.5 h-3.5" />
            <span>Explore {multiRoutesCount} Connecting Routes</span>
          </button>
        )}
      </div>

      {/* Empty State: Informative Message when 0 Direct Trains */}
      {trains.length === 0 ? (
        <div className="bg-[#FFFFFF] border border-[#E6EAF0] rounded-2xl p-6 sm:p-8 rp-shadow-card">
          <div className="max-w-2xl space-y-3">
            <div className="inline-flex items-center gap-2 text-xs font-semibold text-[#64748B] bg-[#F8FAFC] border border-[#E6EAF0] px-3 py-1 rounded-lg">
              <AlertCircle className="w-4 h-4 text-[#168A83] shrink-0" />
              <span>
                {multiRoutesCount > 0
                  ? `No Direct Train on ${journeyDate}`
                  : 'No Direct Service in Timetable Dataset'}
              </span>
            </div>

            <h3 className="text-lg font-bold text-[#17243B]">
              {multiRoutesCount > 0
                ? `${multiRoutesCount} Connecting Multi-Route Options Available`
                : 'Direct Service Not Available for this Corridor'}
            </h3>

            <p className="text-sm text-[#64748B] leading-relaxed">
              {diagnostics?.summary ||
                `No direct commercial train connects ${fromName} (${fromCode}) to ${toName} (${toCode}) on ${journeyDate}. You can explore connecting routes with verified station interchanges below.`}
            </p>

            {diagnostics && diagnostics.reasons.length > 0 && (
              <ul className="space-y-1 text-xs text-[#64748B] list-disc list-inside pt-1">
                {diagnostics.reasons.map((reason, idx) => (
                  <li key={idx}>{reason}</li>
                ))}
              </ul>
            )}

            <div className="pt-2 flex flex-wrap items-center gap-3">
              {multiRoutesCount > 0 && (
                <button
                  type="button"
                  onClick={onSwitchToMultiRoutes}
                  className="px-4 py-2.5 bg-[#2447A8] hover:bg-[#1D3B8E] text-white text-xs font-semibold rounded-xl shadow-[0_2px_6px_rgba(36,71,168,0.2)] transition-all flex items-center gap-2 cursor-pointer"
                >
                  <GitBranch className="w-4 h-4" />
                  <span>View {multiRoutesCount} Connecting Routes</span>
                </button>
              )}

              {diagnostics && diagnostics.directTrainsAnyDayCount > 0 && (
                <button
                  type="button"
                  onClick={() => onChangeDate('2026-10-28')}
                  className="px-3.5 py-2.5 bg-[#FFFFFF] hover:bg-[#F8FAFC] text-[#17243B] text-xs font-semibold rounded-xl border border-[#E6EAF0] transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 text-[#168A83]" />
                  <span>Check Alternative Operating Day</span>
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        /* Direct Train Cards List */
        <div className="space-y-3 sm:space-y-4">
          {trains.map((train) => {
            const isExpanded = expandedTrain === train.trainNumber;

            return (
              <div
                key={train.trainNumber}
                className="bg-[#FFFFFF] border border-[#E6EAF0] hover:border-[#CBD5E1] rounded-2xl p-4 sm:p-5 rp-shadow-card transition-all"
              >
                {/* Train Card Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3.5 border-b border-[#E6EAF0]">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-sm font-bold text-[#2447A8]">
                        {train.trainNumber}
                      </span>
                      <span className="text-[#CBD5E1]" aria-hidden="true">
                        ·
                      </span>
                      <h3 className="text-[15px] sm:text-base font-bold text-[#17243B] truncate">
                        {train.trainName}
                      </h3>
                    </div>
                    <div className="text-xs text-[#64748B] mt-1 flex flex-wrap items-center gap-1.5">
                      <span>
                        Runs:{' '}
                        {train.operatingDaysAvailable === false
                          ? 'Schedule Snapshot'
                          : train.operatingDays.join(', ')}
                      </span>
                      <span aria-hidden="true" className="text-[#CBD5E1]">
                        ·
                      </span>
                      <span>Classes: {train.classes.join(', ')}</span>
                      <span aria-hidden="true" className="text-[#CBD5E1]">
                        ·
                      </span>
                      <span className="font-mono text-[11px]">
                        {train.trainOriginCode} → {train.trainDestinationCode}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
                    <button
                      type="button"
                      onClick={() => onOpenLiveStatus(train.trainNumber)}
                      className="px-3 py-1.5 text-xs font-semibold text-[#17243B] hover:text-[#2447A8] bg-[#F8FAFC] hover:bg-[#EEF2F7] border border-[#E6EAF0] rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      <Activity className="w-3.5 h-3.5 text-[#168A83]" />
                      <span>Live Status</span>
                    </button>
                  </div>
                </div>

                {/* Timetable & Distance Row */}
                <div className="py-4 grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                  {/* Departure */}
                  <div>
                    <div className="font-mono text-xl sm:text-2xl font-bold text-[#17243B] tabular-nums">
                      {train.departureTime}
                    </div>
                    <div className="text-xs font-bold text-[#17243B] mt-0.5">
                      {train.fromStationName}
                    </div>
                    <div className="text-xs text-[#64748B] font-mono mt-0.5">
                      {train.fromStationCode}
                      {train.fromPlatform ? ` · Platform ${train.fromPlatform}` : ''}
                    </div>
                  </div>

                  {/* Journey Duration & Distance Track */}
                  <div className="md:col-span-2 flex flex-col items-center justify-center px-2">
                    <div className="text-xs font-mono text-[#64748B] flex flex-wrap items-center justify-center gap-2">
                      <span className="inline-flex items-center gap-1 text-[#17243B] font-semibold">
                        <Clock className="w-3.5 h-3.5 text-[#168A83]" />
                        {formatDuration(train.durationMinutes)}
                      </span>
                      <span aria-hidden="true" className="text-[#CBD5E1]">
                        ·
                      </span>
                      <span className="font-bold text-[#2447A8]">
                        {train.distanceReliable !== false && train.distanceKm > 0
                          ? `${train.distanceKm} km verified`
                          : 'Distance unavailable'}
                      </span>
                      <span aria-hidden="true" className="text-[#CBD5E1]">
                        ·
                      </span>
                      <span>{train.intermediateStopsCount} stops</span>
                    </div>

                    <div className="w-full h-px bg-[#E6EAF0] my-2.5 relative flex items-center justify-center">
                      <div className="bg-[#FFFFFF] px-2 text-[#2447A8]">
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>

                    <div className="text-[11px] text-[#64748B] text-center">
                      Scheduled Daily Timetable · Arrival {train.arrivalTime} ({train.arrivalDate})
                    </div>
                  </div>

                  {/* Arrival */}
                  <div className="md:text-right">
                    <div className="font-mono text-xl sm:text-2xl font-bold text-[#17243B] tabular-nums">
                      {train.arrivalTime}
                    </div>
                    <div className="text-xs font-bold text-[#17243B] mt-0.5">
                      {train.toStationName}
                    </div>
                    <div className="text-xs text-[#64748B] font-mono mt-0.5">
                      {train.toStationCode}
                      {train.toPlatform ? ` · Platform ${train.toPlatform}` : ''}
                    </div>
                  </div>
                </div>

                {/* Card Footer Actions */}
                <div className="pt-3 border-t border-[#E6EAF0] flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedTrain(isExpanded ? null : train.trainNumber)
                    }
                    className="text-xs font-semibold text-[#2447A8] hover:text-[#1D3B8E] flex items-center gap-1.5 py-1 cursor-pointer transition-colors"
                  >
                    {isExpanded ? (
                      <>
                        <ChevronUp className="w-4 h-4" />
                        <span>Hide Full Timetable</span>
                      </>
                    ) : (
                      <>
                        <ChevronDown className="w-4 h-4" />
                        <span>Inspect Full Timetable ({train.allStops.length} stops)</span>
                      </>
                    )}
                  </button>

                  <span className="text-[11px] font-mono text-[#64748B]">
                    {train.allStops.length} stations
                  </span>
                </div>

                {/* Expandable Timetable Table */}
                {isExpanded && (
                  <div className="mt-4 pt-4 border-t border-[#E6EAF0]">
                    <div className="flex items-center justify-between mb-3 text-xs">
                      <h4 className="font-bold text-[#17243B]">
                        Complete Scheduled Timetable — {train.trainNumber} {train.trainName}
                      </h4>
                      <span className="text-[#64748B]">
                        Selected journey segment highlighted
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-[#E6EAF0]">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-[#F8FAFC] border-b border-[#E6EAF0] text-[#64748B] font-semibold text-[11px] uppercase tracking-wider">
                            <th className="py-2.5 px-3">#</th>
                            <th className="py-2.5 px-3">Station</th>
                            <th className="py-2.5 px-3 font-mono">Code</th>
                            <th className="py-2.5 px-3 text-right font-mono">Arr</th>
                            <th className="py-2.5 px-3 text-right font-mono">Dep</th>
                            <th className="py-2.5 px-3 text-right font-mono">Halt</th>
                            <th className="py-2.5 px-3 text-right font-mono">Day</th>
                            <th className="py-2.5 px-3 text-right font-mono">Distance</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#E6EAF0]">
                          {train.allStops.map((stop) => {
                            const isBoarding = stop.stationCode === train.fromStationCode;
                            const isAlighting = stop.stationCode === train.toStationCode;
                            const isHighlighted = isBoarding || isAlighting;

                            return (
                              <tr
                                key={stop.stationCode}
                                className={
                                  isHighlighted
                                    ? 'bg-[#EEF2F7]/70 font-semibold text-[#17243B]'
                                    : 'text-[#17243B] hover:bg-[#F8FAFC]'
                                }
                              >
                                <td className="py-2 px-3 font-mono text-[#64748B]">
                                  {stop.stopSequence}
                                </td>
                                <td className="py-2 px-3 flex items-center gap-1.5">
                                  {isHighlighted && (
                                    <Navigation className="w-3 h-3 text-[#2447A8] shrink-0" />
                                  )}
                                  <span>{stop.stationName}</span>
                                  {isBoarding && (
                                    <span className="text-[10px] text-[#2447A8] font-bold uppercase ml-1">
                                      (Boarding)
                                    </span>
                                  )}
                                  {isAlighting && (
                                    <span className="text-[10px] text-[#2447A8] font-bold uppercase ml-1">
                                      (Destination)
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-3 font-mono font-bold text-[#2447A8]">
                                  {stop.stationCode}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-[#64748B]">
                                  {stop.arrivalTime || 'Origin'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-[#64748B]">
                                  {stop.departureTime || 'Dest'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-[#64748B]">
                                  {stop.haltMinutes > 0 ? `${stop.haltMinutes}m` : '—'}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums text-[#64748B]">
                                  Day {stop.dayOffset}
                                </td>
                                <td className="py-2 px-3 text-right font-mono tabular-nums font-medium text-[#17243B]">
                                  {stop.distanceKm >= 0 ? `${stop.distanceKm} km` : '—'}
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
          })}
        </div>
      )}
    </div>
  );
};
