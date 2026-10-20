import React, { useState, useEffect } from 'react';
import { BacktestItem } from '../../types';
import { TIER_CONFIG } from '../../utils/formatters';
import { api } from '../../api';
import { RefreshCw } from 'lucide-react';

interface ReplayTabProps {
  dataset: string;
}

export const ReplayTab: React.FC<ReplayTabProps> = ({ dataset }) => {
  const [data, setData] = useState<BacktestItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setError(null);

    api
      .getBacktest(dataset)
      .then((res) => {
        if (active) {
          setData(res);
          setIsLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || 'Failed to load backtest replay data');
          setIsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [dataset]);

  if (isLoading) {
    return (
      <div className="p-8 text-center space-y-2">
        <RefreshCw className="w-6 h-6 animate-spin text-sky-600 mx-auto" />
        <p className="text-xs text-slate-500">Loading historical timeline backtest...</p>
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            Historical Portfolio Replay (Backtest)
          </h3>
          <p className="text-xs text-slate-500">
            Week-by-week state progression comparing RetainIQ multi-tier classification against the starter utility.
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-2 text-[10px]">
          <span className="text-slate-500 font-semibold mr-1">Tiers:</span>
          {Object.entries(TIER_CONFIG).map(([t, cfg]) => (
            <span key={t} className="flex items-center gap-1">
              <span
                className="w-2.5 h-2.5 rounded-xs"
                style={{ backgroundColor: cfg.hexColor }}
              />
              <span className="text-slate-600">{cfg.displayName}</span>
            </span>
          ))}
          <span className="text-slate-300 mx-1">|</span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-400" />
            <span className="text-slate-600">Starter Flagged</span>
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-xs bg-red-400" />
            <span className="text-slate-600">Starter Errored</span>
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {data.map((item) => {
          return (
            <div
              key={item.account_id}
              className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs hover:border-slate-300 transition-all"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 text-xs">{item.account_name}</span>
                  <span className="font-mono text-[11px] text-slate-400">({item.account_id})</span>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">RetainIQ 1st alert:</span>
                    {item.first_alert_week ? (
                      <span className="font-bold text-sky-700 bg-sky-50 border border-sky-200 px-1.5 py-0.5 rounded text-[11px]">
                        Week {item.first_alert_week} ({item.first_alert_tier})
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium">None</span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">Starter 1st alert:</span>
                    {item.starter_first_flag_week ? (
                      <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded text-[11px]">
                        Week {item.starter_first_flag_week}
                      </span>
                    ) : (
                      <span className="text-slate-400 font-medium">None</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Two thin rows timeline */}
              <div className="overflow-x-auto pb-1">
                <div className="space-y-1 min-w-max">
                  {/* Row 1: RetainIQ */}
                  <div className="flex items-center gap-1">
                    <span className="w-16 text-[10px] font-bold text-slate-500 shrink-0">
                      RetainIQ
                    </span>
                    <div className="flex items-center gap-1">
                      {item.timeline.map((step) => {
                        const cfg = TIER_CONFIG[step.tier] || TIER_CONFIG.TOO_NEW;
                        return (
                          <div
                            key={`ours-${step.week}`}
                            title={`W${step.week}: ${cfg.displayName}`}
                            className="w-5 h-4 rounded-xs transition-transform hover:scale-110 flex items-center justify-center text-[8px] font-mono font-bold text-white shadow-2xs"
                            style={{ backgroundColor: cfg.hexColor }}
                          >
                            {step.week}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Row 2: Starter */}
                  <div className="flex items-center gap-1">
                    <span className="w-16 text-[10px] font-bold text-slate-500 shrink-0">
                      Starter
                    </span>
                    <div className="flex items-center gap-1">
                      {item.timeline.map((step) => {
                        let bg = '#e2e8f0'; // healthy / unflagged slate
                        let text = 'ok';
                        if (step.starter_flagged === true) {
                          bg = '#fbbf24'; // amber flagged
                          text = '!';
                        } else if (step.starter_flagged === null) {
                          bg = '#f87171'; // red errored
                          text = 'x';
                        }

                        return (
                          <div
                            key={`starter-${step.week}`}
                            title={`W${step.week}: Starter ${
                              step.starter_flagged === null
                                ? 'Errored'
                                : step.starter_flagged
                                ? 'Flagged'
                                : 'OK'
                            }`}
                            className="w-5 h-4 rounded-xs transition-transform hover:scale-110 flex items-center justify-center text-[8px] font-mono font-bold text-slate-800 shadow-2xs"
                            style={{ backgroundColor: bg }}
                          >
                            {text}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
