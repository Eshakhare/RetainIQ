import React from 'react';
import { ConfigResponse, Tier } from '../../types';
import { TIER_CONFIG } from '../../utils/formatters';
import { ShieldCheck, Info, Sliders } from 'lucide-react';

interface HowItWorksTabProps {
  config: ConfigResponse | null;
}

export const HowItWorksTab: React.FC<HowItWorksTabProps> = ({ config }) => {
  if (!config) {
    return <div className="p-8 text-center text-slate-400">Loading engine configuration...</div>;
  }

  const { definitions, thresholds, flagged_tiers } = config;

  return (
    <div className="space-y-6">
      {/* Principle Callout */}
      <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex items-start gap-3 text-sky-950">
        <ShieldCheck className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h4 className="text-sm font-bold">Deterministic Engine Core</h4>
          <p className="text-xs text-sky-900 leading-relaxed font-medium">
            Detection is deterministic. AI only writes the explanation and never decides a tier or calculates a number.
          </p>
          <p className="text-[11px] text-sky-800">
            All thresholds, drop formulas, baseline windows, and rules run strictly inside the backend engine. The browser is purely a presentation layer that visualizes verified telemetry.
          </p>
        </div>
      </div>

      {/* Tier Classification Rules */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
            Deterministic Tier Classification Rules
          </h3>
          <span className="text-[11px] text-slate-500 font-medium">
            Evaluated in hierarchical priority order
          </span>
        </div>

        <div className="divide-y divide-slate-100">
          {Object.entries(definitions.tiers)
            .filter(([tierKey]) => tierKey !== 'ERROR')
            .map(([tierKey, ruleText]) => {
              const tier = tierKey as Tier;
            const cfg = TIER_CONFIG[tier] || TIER_CONFIG.ERROR;
            const isFlagged = flagged_tiers.includes(tier);

            return (
              <div
                key={tierKey}
                className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${cfg.badgeBg} ${cfg.badgeText} ${cfg.border}`}
                  >
                    <span
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: cfg.hexColor }}
                    />
                    <span>{cfg.displayName}</span>
                  </span>

                  {isFlagged ? (
                    <span className="text-[10px] uppercase font-bold tracking-wider bg-rose-50 text-rose-700 border border-rose-200 px-2 py-0.5 rounded">
                      Action Required
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-slate-400">
                      Standard
                    </span>
                  )}
                </div>

                <div className="text-xs font-mono bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 text-slate-800 flex-1 sm:max-w-xl text-left">
                  {ruleText}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Definitions in Plain Language */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Info className="w-4 h-4 text-sky-600" />
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Mathematical Metric Definitions
            </h3>
          </div>

          <div className="space-y-3 text-xs">
            <div>
              <span className="font-bold text-slate-800 block">Baseline Level</span>
              <p className="text-slate-600 mt-0.5">{definitions.baseline_level}</p>
            </div>
            <div>
              <span className="font-bold text-slate-800 block">Recent Level</span>
              <p className="text-slate-600 mt-0.5">{definitions.recent_level}</p>
            </div>
            <div>
              <span className="font-bold text-slate-800 block">Drop % vs Baseline</span>
              <p className="text-slate-600 mt-0.5">{definitions.drop}</p>
            </div>
            <div>
              <span className="font-bold text-slate-800 block">Last-2 Persistence Drop</span>
              <p className="text-slate-600 mt-0.5">{definitions.last2_drop}</p>
            </div>
            <div>
              <span className="font-bold text-slate-800 block">Noise (Coefficient of Variation)</span>
              <p className="text-slate-600 mt-0.5">{definitions.noise}</p>
            </div>
          </div>
        </div>

        {/* Engine Thresholds */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-2xs">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5">
            <Sliders className="w-4 h-4 text-indigo-600" />
            <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wider">
              Engine Threshold Configuration
            </h3>
          </div>

          <div className="overflow-y-auto max-h-72 space-y-2 pr-1">
            <div className="grid grid-cols-2 gap-2 text-xs">
              {Object.entries(thresholds).map(([key, val]) => (
                <div
                  key={key}
                  className="bg-slate-50 p-2 rounded-lg border border-slate-200/80 flex items-center justify-between"
                >
                  <span className="font-mono text-slate-600 text-[11px] truncate mr-2" title={key}>
                    {key}
                  </span>
                  <span className="font-mono font-bold text-slate-900 text-[11px] bg-white px-1.5 py-0.5 rounded border border-slate-200">
                    {val}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
