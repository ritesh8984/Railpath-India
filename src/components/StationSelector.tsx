import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, X, ChevronDown } from 'lucide-react';
import { NormalizedStation } from '../types/railway';

interface StationSelectorProps {
  id: string;
  label: string;
  selectedCode: string;
  selectedDisplayName: string;
  onSelect: (station: NormalizedStation) => void;
  placeholder?: string;
}

export const StationSelector: React.FC<StationSelectorProps> = ({
  id,
  label,
  selectedCode,
  selectedDisplayName,
  onSelect,
  placeholder = 'Station name, code, or city...',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [resolvedQuery, setResolvedQuery] = useState<string | null>(null);
  const [results, setResults] = useState<NormalizedStation[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const queryRef = useRef(query);
  queryRef.current = query;

  const resolveAndSelectQuery = async (rawQuery: string, exactOnly = false) => {
    const trimmed = rawQuery.trim();
    if (!trimmed) return;
    try {
      const res = await fetch(
        `/api/stations/search?q=${encodeURIComponent(trimmed)}&limit=12`
      );
      if (!res.ok) return;
      const data = await res.json();
      const list: NormalizedStation[] = data.stations || [];
      if (list.length === 0) return;
      if (exactOnly) {
        const lower = trimmed.toLowerCase();
        const exact = list.find(
          (s) =>
            s.code.toLowerCase() === lower ||
            s.name.toLowerCase() === lower ||
            s.displayName.toLowerCase() === lower
        );
        if (exact) {
          onSelect(exact);
        }
      } else {
        onSelect(list[0]);
      }
    } catch {
      // Ignore network errors
    }
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        if (queryRef.current.trim()) {
          void resolveAndSelectQuery(queryRef.current, true);
        }
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/stations/search?q=${encodeURIComponent(query)}&limit=12`
        );
        if (res.ok && !cancelled) {
          const data = await res.json();
          setResults(data.stations || []);
          setResolvedQuery(query);
          setHighlightedIndex(0);
        }
      } catch {
        // Ignore transient network errors
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 60);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, isOpen]);

  const handleOpen = () => {
    setIsOpen(true);
    setQuery('');
    setResolvedQuery(null);
    setTimeout(() => inputRef.current?.focus(), 20);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        handleOpen();
      }
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.min(results.length - 1, prev + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((prev) => Math.max(0, prev - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (resolvedQuery === query && results[highlightedIndex]) {
        onSelect(results[highlightedIndex]);
        setQuery('');
        setIsOpen(false);
      } else if (query.trim()) {
        void resolveAndSelectQuery(query, false).then(() => {
          setQuery('');
          setIsOpen(false);
        });
      }
    } else if (e.key === 'Escape') {
      setQuery('');
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative flex-1 min-w-0 w-full">
      {!isOpen ? (
        <button
          id={id}
          type="button"
          onClick={handleOpen}
          onKeyDown={handleKeyDown}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-label={`${label}: ${selectedDisplayName} (${selectedCode})`}
          className="group w-full h-[66px] sm:h-[72px] px-3.5 sm:px-4 py-2 text-left bg-[#FFFFFF] hover:bg-[#F8FAFC]/80 border border-[#E6EAF0] hover:border-[#CBD5E1] rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-[#2447A8] transition-all flex items-center justify-between gap-2.5 cursor-pointer"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[#64748B]">
                {label}
              </span>
              <span className="font-mono text-xs font-bold tracking-tight text-[#2447A8] shrink-0">
                {selectedCode}
              </span>
            </div>
            <div className="flex items-baseline gap-1.5 min-w-0 mt-0.5">
              <span className="text-[15px] sm:text-base font-semibold text-[#17243B] truncate leading-tight">
                {selectedDisplayName || 'Select Station'}
              </span>
            </div>
            <div className="text-[11px] text-[#64748B] truncate mt-0.5 leading-tight">
              Search by station name, code or city
            </div>
          </div>
          <ChevronDown className="w-4 h-4 text-[#64748B] group-hover:text-[#17243B] transition-colors shrink-0" />
        </button>
      ) : (
        <div className="w-full h-[66px] sm:h-[72px] px-3.5 sm:px-4 py-2 bg-[#FFFFFF] border border-[#2447A8] ring-2 ring-[#2447A8]/15 rounded-xl flex flex-col justify-center">
          <label
            htmlFor={id}
            className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-[#2447A8] mb-1"
          >
            {label}
          </label>
          <div className="flex items-center gap-2">
            <Search className="w-4 h-4 text-[#2447A8] shrink-0" />
            <input
              ref={inputRef}
              id={id}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              aria-label={label}
              autoComplete="off"
              className="w-full text-[15px] font-medium text-[#17243B] placeholder:text-[#64748B]/70 focus:outline-none bg-transparent"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery('')}
                aria-label="Clear search query"
                className="p-1 text-[#64748B] hover:text-[#17243B] rounded-md transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {isOpen && (
        <div
          role="listbox"
          aria-label={`${label} suggestions`}
          className="absolute left-0 right-0 top-full mt-2 z-50 bg-[#FFFFFF] border border-[#E6EAF0] rounded-xl rp-shadow-dropdown max-h-80 overflow-y-auto divide-y divide-[#E6EAF0]/70"
        >
          <div className="px-4 py-2 bg-[#F8FAFC] text-[11px] text-[#64748B] flex items-center justify-between">
            <span>
              {query
                ? `Matching stations for "${query}"`
                : 'Nationwide railway station directory (8,938 stations)'}
            </span>
            <span className="font-mono text-[10px] uppercase tracking-wider text-[#168A83] font-semibold">
              Verified Index
            </span>
          </div>

          {loading && results.length === 0 ? (
            <div className="p-5 text-sm text-[#64748B] text-center">
              Searching nationwide station directory...
            </div>
          ) : results.length === 0 ? (
            <div className="p-5 text-sm text-[#64748B] text-center">
              No railway station matched &ldquo;{query}&rdquo;. Try station code (e.g. ROU, BSB, UD) or city name.
            </div>
          ) : (
            results.map((station, idx) => {
              const isHighlighted = idx === highlightedIndex;
              const isSelected = station.code === selectedCode;
              return (
                <button
                  key={station.code}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onSelect(station);
                    setQuery('');
                    setIsOpen(false);
                  }}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`w-full px-4 py-2.5 text-left transition-colors flex items-center justify-between gap-3 cursor-pointer ${
                    isHighlighted ? 'bg-[#F8FAFC]' : 'hover:bg-[#F8FAFC]/70'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-[#17243B] truncate">
                        {station.displayName}
                      </span>
                      <span className="font-mono text-xs font-bold text-[#2447A8] shrink-0">
                        {station.code}
                      </span>
                    </div>
                    <div className="text-xs text-[#64748B] flex items-center gap-1.5 mt-0.5 truncate">
                      <span>{station.zone} Zone</span>
                      {station.city && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>
                            {station.city}
                            {station.state ? `, ${station.state}` : ''}
                          </span>
                        </>
                      )}
                      {station.hindiName && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span>{station.hindiName}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <MapPin className="w-3.5 h-3.5 text-[#64748B]/60" />
                    <span className="font-mono text-[11px] font-medium text-[#64748B]">
                      {station.category === 'JUNCTION' ? 'Jn' : station.zone}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
};
