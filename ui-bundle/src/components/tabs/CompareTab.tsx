import React, { useState, useEffect } from 'react';
import { CompareItem, Verdict } from '../../types';
import { TIER_CONFIG, formatPct } from '../../utils/formatters';
import { api } from '../../api';
import {
  CheckCircle2,
  AlertTriangle,
  Flame,
  Info,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';

interface CompareTabProps {
  dataset: string;
}

export const CompareTab: React.FC<CompareTabProps> = ({ dataset }) => {
  const [data, setData] = useState<CompareItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    api
      .getCompare(dataset)
      .then((res) => {
        if (active) {
          setData(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || 'Failed to load comparison data');
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [dataset]);

  const renderVerdictBadge = (verdict: Verdict) => {
    switch (verdict) {
      case 'agree':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Agree</span>
          </span>
        );
      case 'we_catch_more':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-50 text-sky-800 border border-sky-300 shadow-2xs">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-600" />
            <span>RetainIQ catches more</span>
          </span>
        );
      case 'starter_false_alarm':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-300">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
            <span>Starter false alarm</span>
          </span>
        );
      case 'starter_error':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-800 border border-rose-300">
            <Flame className="w-3.5 h-3.5 text-rose-600" />
            <span>Starter crashed</span>
          </span>
        );
    }
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center space-y-2">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-600 mx-auto" />
        <p className="text-xs text-slate-500">Comparing RetainIQ against starter utility...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200 text-xs">
        {error}
      </div>
    );
  }

  const disagreementCount = data.filter((d) => d.verdict !== 'agree').length;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            RetainIQ vs Starter Baseline Comparison
          </h3>
          <p className="text-xs text-slate-500">
            Evaluating detection accuracy, false positive reduction, and error resilience.
          </p>
        </div>
        {disagreementCount > 0 && (
          <span className="inline-flex items-center gap-1 text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-1 rounded-full">
            <Info className="w-3.5 h-3.5 text-amber-600" />
            <span>{disagreementCount} diverging {disagreementCount === 1 ? 'account' : 'accounts'}</span>
          </span>
        )}
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-100/70 border-b border-slate-200 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                <th className="py-3 px-4">Account</th>
                <th className="py-3 px-3">RetainIQ Tier</th>
                <th className="py-3 px-3 text-right">RetainIQ Drop</th>
                <th className="py-3 px-3 text-center">Starter Flagged</th>
                <th className="py-3 px-3 text-right">Starter Trend</th>
                <th className="py-3 px-4">Verdict</th>
                <th className="py-3 px-4">Comparison Analysis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data.map((row) => {
                const tierCfg = TIER_CONFIG[row.ours.tier] || TIER_CONFIG.ERROR;
                const isDisagreement = row.verdict !== 'agree';

                return (
                  <tr
                    key={row.account_id}
                    className={`transition-colors ${
                      isDisagreement ? 'bg-amber-50/40 font-medium' : 'hover:bg-slate-50/70'
                    }`}
                  >
                    {/* Account */}
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{row.account_name}</div>
                      <div className="text-[11px] font-mono text-slate-400">{row.account_id}</div>
                    </td>

                    {/* Our Tier */}
                    <td className="py-3 px-3 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-bold border ${tierCfg.badgeBg} ${tierCfg.badgeText} ${tierCfg.border}`}
                      >
                        <span
                          className="w-1.5 h-1.5 rounded-full"
                          style={{ backgroundColor: tierCfg.hexColor }}
                        />
                        <span>{tierCfg.displayName}</span>
                      </span>
                    </td>

                    {/* Our Drop */}
                    <td className="py-3 px-3 text-right font-mono font-medium">
                      {formatPct(row.ours.drop_pct)}
                    </td>

                    {/* Starter Flagged */}
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      {row.starter.error ? (
                        <span className="text-[11px] font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">
                          ERROR
                        </span>
                      ) : row.starter.flagged ? (
                        <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded">
                          Yes
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                          No
                        </span>
                      )}
                    </td>

                    {/* Starter Trend */}
                    <td className="py-3 px-3 text-right font-mono text-slate-600">
                      {row.starter.error ? (
                        <span className="text-red-500 italic text-[11px]">-</span>
                      ) : (
                        formatPct(row.starter.trend_pct)
                      )}
                    </td>

                    {/* Verdict */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      {renderVerdictBadge(row.verdict)}
                    </td>

                    {/* Note */}
                    <td className="py-3 px-4 text-slate-600 text-xs leading-relaxed max-w-sm">
                      {row.note}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
