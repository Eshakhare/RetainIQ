import React from 'react';
import { Tier, AnalyzeSummary } from '../types';
import { TIER_CONFIG, ALL_TIERS } from '../utils/formatters';
import { Filter, AlertTriangle, ShieldCheck } from 'lucide-react';

interface SummaryStripProps {
  summary: AnalyzeSummary | null;
  selectedTier: Tier | null;
  onSelectTier: (tier: Tier | null) => void;
  isLoading?: boolean;
}

export const SummaryStrip: React.FC<SummaryStripProps> = ({
  summary,
  selectedTier,
  onSelectTier,
  isLoading,
}) => {
  if (isLoading || !summary) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-20 bg-slate-100 animate-pulse rounded-xl border border-slate-200"
          />
        ))}
      </div>
    );
  }

  const flaggedCount = summary.flagged;
  const totalCount = summary.total_accounts;
  const flaggedPct = totalCount > 0 ? Math.round((flaggedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-2 mb-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
        {/* Highlight Flagged / Total Tile */}
        <div
          onClick={() => onSelectTier(null)}
          className={`col-span-2 sm:col-span-2 lg:col-span-1 rounded-xl p-3 border transition-all cursor-pointer flex flex-col justify-between ${
            selectedTier === null
              ? 'bg-slate-900 text-white border-slate-800 shadow-sm ring-2 ring-sky-500/50'
              : 'bg-white hover:bg-slate-50 text-slate-900 border-slate-200 shadow-2xs'
          }`}
          title="Click to show all accounts"
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-semibold uppercase tracking-wider ${
                selectedTier === null ? 'text-slate-300' : 'text-slate-500'
              }`}
            >
              Flagged CS Load
            </span>
            {flaggedCount > 0 ? (
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            )}
          </div>
          <div className="mt-1">
            <div className="flex items-baseline gap-1.5">
              <span className="text-2xl font-black">
                {flaggedCount}
              </span>
              <span className={`text-xs ${selectedTier === null ? 'text-slate-400' : 'text-slate-500'}`}>
                of {totalCount}
              </span>
            </div>
            <div className={`text-[10px] ${selectedTier === null ? 'text-sky-300' : 'text-sky-600 font-medium'}`}>
              {flaggedPct}% portfolio at risk
            </div>
          </div>
        </div>

        {/* Tier Tiles */}
        {ALL_TIERS.map((tier) => {
          const cfg = TIER_CONFIG[tier];
          const count = summary.counts_by_tier[tier] ?? 0;
          const isSelected = selectedTier === tier;

          return (
            <button
              key={tier}
              type="button"
              onClick={() => onSelectTier(isSelected ? null : tier)}
              className={`rounded-xl p-3 text-left border transition-all cursor-pointer flex flex-col justify-between relative group ${
                isSelected
                  ? 'bg-white shadow-md ring-2 ring-sky-600 ' + cfg.border
                  : 'bg-white hover:bg-slate-50/80 border-slate-200 shadow-2xs'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span className="text-[11px] font-semibold text-slate-600 truncate mr-1">
                  {cfg.displayName}
                </span>
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: cfg.hexColor }}
                />
              </div>

              <div className="mt-2 flex items-baseline justify-between w-full">
                <span
                  className="text-2xl font-bold tracking-tight"
                  style={{ color: isSelected ? cfg.hexColor : undefined }}
                >
                  {count}
                </span>
                {isSelected && (
                  <span className="text-[10px] font-semibold bg-sky-100 text-sky-800 px-1.5 py-0.5 rounded">
                    Active
                  </span>
                )}
              </div>

              {/* Subtitle / fraction */}
              <div className="text-[10px] text-slate-400 mt-0.5">
                {totalCount > 0 ? `${Math.round((count / totalCount) * 100)}%` : '0%'}
              </div>
            </button>
          );
        })}
      </div>

      {selectedTier && (
        <div className="flex items-center justify-between px-3 py-1.5 bg-sky-50 border border-sky-200 rounded-lg text-xs text-sky-800">
          <div className="flex items-center gap-2">
            <Filter className="w-3.5 h-3.5" />
            <span>
              Filtering by tier: <strong>{TIER_CONFIG[selectedTier].displayName}</strong> ({summary.counts_by_tier[selectedTier] || 0} accounts)
            </span>
          </div>
          <button
            type="button"
            onClick={() => onSelectTier(null)}
            className="text-sky-700 hover:text-sky-950 font-semibold underline text-xs"
          >
            Clear filter
          </button>
        </div>
      )}
    </div>
  );
};
