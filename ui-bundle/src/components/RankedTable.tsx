import React, { useState, useMemo } from 'react';
import {
  AccountResult,
  Tier,
} from '../types';
import { TIER_CONFIG, formatPct } from '../utils/formatters';
import { Sparkline } from './Sparkline';
import {
  Search,
  AlertCircle,
  HelpCircle,
  ChevronRight,
  TrendingUp,
  Activity,
  Flame,
  CheckCircle,
} from 'lucide-react';

interface RankedTableProps {
  results: AccountResult[];
  selectedTier: Tier | null;
  onSelectAccount: (account: AccountResult) => void;
  isLoading: boolean;
  activeAccountId?: string | null;
}

export const RankedTable: React.FC<RankedTableProps> = ({
  results,
  selectedTier,
  onSelectAccount,
  isLoading,
  activeAccountId,
}) => {
  const [search, setSearch] = useState('');

  const filteredResults = useMemo(() => {
    return results.filter((acc) => {
      // Tier filter
      if (selectedTier && acc.tier !== selectedTier) {
        return false;
      }
      // Search query
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = acc.account_name.toLowerCase().includes(query);
        const matchesId = acc.account_id.toLowerCase().includes(query);
        const matchesPlan = (acc.plan_tier || '').toLowerCase().includes(query);
        const matchesReason = (acc.reason || '').toLowerCase().includes(query);
        return matchesName || matchesId || matchesPlan || matchesReason;
      }
      return true;
    });
  }, [results, selectedTier, search]);

  const renderFlagChip = (flag: string) => {
    switch (flag) {
      case 'low_volume':
        return (
          <span
            key={flag}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200"
            title="Baseline usage < 5 logins/wk (capped at Watch)"
          >
            <Activity className="w-2.5 h-2.5" /> low_vol
          </span>
        );
      case 'recovering':
        return (
          <span
            key={flag}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-50 text-emerald-800 border border-emerald-200"
            title="Last 2 weeks rebounding from drop"
          >
            <TrendingUp className="w-2.5 h-2.5" /> recovering
          </span>
        );
      case 'growing':
        return (
          <span
            key={flag}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-teal-50 text-teal-800 border border-teal-200"
            title="Recent usage >= +25% above baseline"
          >
            <CheckCircle className="w-2.5 h-2.5" /> growing
          </span>
        );
      case 'volatile':
        return (
          <span
            key={flag}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-800 border border-indigo-200"
            title="High baseline variance (CV >= 0.20)"
          >
            <Activity className="w-2.5 h-2.5" /> volatile
          </span>
        );
      case 'early_ramp_down':
        return (
          <span
            key={flag}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-rose-50 text-rose-800 border border-rose-200"
            title="Initial onboarding weeks were artificially high"
          >
            <Flame className="w-2.5 h-2.5" /> early_ramp_down
          </span>
        );
      default:
        return (
          <span
            key={flag}
            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-100 text-slate-700 border border-slate-200"
          >
            {flag}
          </span>
        );
    }
  };

  const renderConfidenceBadge = (confidence: string | null) => {
    if (!confidence) return <span className="text-slate-400 text-xs">n/a</span>;
    let badgeClass = 'bg-slate-100 text-slate-700 border-slate-200';
    if (confidence === 'High') badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
    if (confidence === 'Medium') badgeClass = 'bg-sky-50 text-sky-800 border-sky-200';
    if (confidence === 'Low') badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';

    return (
      <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium border ${badgeClass}`}>
        {confidence}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-8">
      {/* Table Toolbar */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-bold text-slate-900 text-sm tracking-tight">
            Ranked Risk Portfolio
          </h3>
          <span className="text-xs bg-slate-200 text-slate-700 font-semibold px-2 py-0.5 rounded-full">
            {filteredResults.length} {filteredResults.length === 1 ? 'account' : 'accounts'}
          </span>
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search account, ID, plan or reason..."
            className="w-full text-xs pl-9 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 shadow-2xs"
          />
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-700 border-collapse">
          <thead>
            <tr className="bg-slate-100/80 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
              <th className="py-3 px-3 w-12 text-center">Rank</th>
              <th className="py-3 px-3 w-32">Tier</th>
              <th className="py-3 px-4 w-48">Account</th>
              <th className="py-3 px-3 w-24">Plan</th>
              <th className="py-3 px-3 w-36">History Sparkline</th>
              <th className="py-3 px-3 w-28 text-right">Drop vs Baseline</th>
              <th className="py-3 px-3 w-24 text-right">Last-2 Drop</th>
              <th className="py-3 px-3 w-24 text-center">Confidence</th>
              <th className="py-3 px-3 min-w-[140px]">Signals & Flags</th>
              <th className="py-3 px-4 min-w-[240px]">Engine Explanation</th>
              <th className="py-3 px-2 w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="animate-pulse">
                  <td className="p-3 text-center">
                    <div className="h-4 bg-slate-200 rounded w-6 mx-auto" />
                  </td>
                  <td className="p-3">
                    <div className="h-6 bg-slate-200 rounded w-20" />
                  </td>
                  <td className="p-4">
                    <div className="h-4 bg-slate-200 rounded w-28 mb-1" />
                    <div className="h-3 bg-slate-200 rounded w-16" />
                  </td>
                  <td className="p-3">
                    <div className="h-4 bg-slate-200 rounded w-16" />
                  </td>
                  <td className="p-3">
                    <div className="h-8 bg-slate-200 rounded w-28" />
                  </td>
                  <td className="p-3 text-right">
                    <div className="h-4 bg-slate-200 rounded w-12 ml-auto" />
                  </td>
                  <td className="p-3 text-right">
                    <div className="h-4 bg-slate-200 rounded w-12 ml-auto" />
                  </td>
                  <td className="p-3 text-center">
                    <div className="h-5 bg-slate-200 rounded w-14 mx-auto" />
                  </td>
                  <td className="p-3">
                    <div className="h-4 bg-slate-200 rounded w-24" />
                  </td>
                  <td className="p-4">
                    <div className="h-4 bg-slate-200 rounded w-48" />
                  </td>
                  <td className="p-2"></td>
                </tr>
              ))
            ) : filteredResults.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-12 text-center text-slate-500">
                  <HelpCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                  <p className="font-semibold text-sm text-slate-700">No accounts match the criteria</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {selectedTier
                      ? `No accounts found in tier ${TIER_CONFIG[selectedTier].displayName}`
                      : 'Try adjusting your search query'}
                  </p>
                </td>
              </tr>
            ) : (
              filteredResults.map((acc) => {
                const tierCfg = TIER_CONFIG[acc.tier] || TIER_CONFIG.ERROR;
                const isSelected = activeAccountId === acc.account_id;
                const isError = acc.tier === 'ERROR';

                return (
                  <tr
                    key={acc.account_id}
                    onClick={() => onSelectAccount(acc)}
                    className={`group transition-colors cursor-pointer hover:bg-sky-50/50 ${
                      isSelected ? 'bg-sky-50 ring-1 ring-inset ring-sky-300' : 'bg-white'
                    }`}
                  >
                    {/* Rank */}
                    <td className="py-3 px-3 text-center font-mono font-semibold text-slate-500">
                      {acc.rank > 0 ? `#${acc.rank}` : '-'}
                    </td>

                    {/* Tier Badge */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border ${tierCfg.badgeBg} ${tierCfg.badgeText} ${tierCfg.border}`}
                      >
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: tierCfg.hexColor }}
                        />
                        <span>{tierCfg.displayName}</span>
                      </span>
                    </td>

                    {/* Account */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 group-hover:text-sky-700 transition-colors">
                        {acc.account_name}
                      </div>
                      <div className="text-[11px] font-mono text-slate-400">
                        {acc.account_id}
                      </div>
                    </td>

                    {/* Plan */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span className="capitalize text-slate-600 bg-slate-100 px-2 py-0.5 rounded text-[11px] font-medium border border-slate-200">
                        {acc.plan_tier || 'n/a'}
                      </span>
                    </td>

                    {/* Sparkline */}
                    <td className="py-3 px-3">
                      {isError ? (
                        <span className="text-slate-400 italic text-xs">No chart data</span>
                      ) : (
                        <Sparkline
                          data={acc.weekly_logins}
                          windows={acc.windows}
                          width={110}
                          height={28}
                        />
                      )}
                    </td>

                    {/* Drop vs Baseline */}
                    <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-medium">
                      {acc.drop_pct === null ? (
                        <span className="text-slate-400">n/a</span>
                      ) : (
                        <span
                          className={
                            acc.drop_pct <= -0.3
                              ? 'text-red-600 font-bold'
                              : acc.drop_pct < 0
                              ? 'text-amber-600 font-semibold'
                              : acc.drop_pct > 0.2
                              ? 'text-emerald-600 font-semibold'
                              : 'text-slate-700'
                          }
                        >
                          {formatPct(acc.drop_pct)}
                        </span>
                      )}
                    </td>

                    {/* Last-2 Drop */}
                    <td className="py-3 px-3 text-right whitespace-nowrap font-mono font-medium">
                      {acc.last2_drop_pct === null ? (
                        <span className="text-slate-400">n/a</span>
                      ) : (
                        <span
                          className={
                            acc.last2_drop_pct <= -0.3
                              ? 'text-red-600'
                              : acc.last2_drop_pct < 0
                              ? 'text-amber-600'
                              : 'text-slate-700'
                          }
                        >
                          {formatPct(acc.last2_drop_pct)}
                        </span>
                      )}
                    </td>

                    {/* Confidence */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {renderConfidenceBadge(acc.confidence)}
                    </td>

                    {/* Flags */}
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1 max-w-xs">
                        {acc.flags && acc.flags.map((f) => renderFlagChip(f))}
                        {acc.annotations &&
                          acc.annotations.map((a, i) => (
                            <span
                              key={`ann-${i}`}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 border border-purple-200"
                            >
                              {a}
                            </span>
                          ))}
                        {(!acc.flags || acc.flags.length === 0) &&
                          (!acc.annotations || acc.annotations.length === 0) && (
                            <span className="text-slate-400 text-[11px]">-</span>
                          )}
                      </div>
                    </td>

                    {/* Reason */}
                    <td className="py-3 px-4">
                      {isError && acc.error ? (
                        <div className="flex items-center gap-1.5 text-red-600 font-medium">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>{acc.error.message}</span>
                        </div>
                      ) : (
                        <div className="line-clamp-2 text-slate-600 group-hover:text-slate-800" title={acc.reason}>
                          {acc.reason}
                        </div>
                      )}
                    </td>

                    {/* Drawer icon */}
                    <td className="py-3 px-2 text-right">
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-sky-600 transition-colors" />
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
