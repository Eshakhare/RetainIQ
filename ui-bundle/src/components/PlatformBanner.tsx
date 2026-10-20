import React from 'react';
import { AlertOctagon, TrendingDown } from 'lucide-react';
import { PlatformAnnotation } from '../types';
import { formatPct } from '../utils/formatters';

interface PlatformBannerProps {
  annotations: PlatformAnnotation[];
}

export const PlatformBanner: React.FC<PlatformBannerProps> = ({ annotations }) => {
  if (!annotations || annotations.length === 0) return null;

  return (
    <div className="bg-amber-500 text-white shadow-md rounded-xl p-4 sm:p-5 border border-amber-600 mb-6">
      <div className="flex items-start gap-3.5">
        <div className="p-2 rounded-lg bg-white/20 text-white shrink-0">
          <AlertOctagon className="w-6 h-6 animate-pulse" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider bg-white/25 px-2 py-0.5 rounded">
              Portfolio Alert
            </span>
            <h3 className="text-base font-bold">
              Possible Platform-Wide Event Detected
            </h3>
          </div>

          <div className="space-y-1.5 text-sm text-amber-50 font-medium">
            {annotations.map((ann, idx) => (
              <div
                key={idx}
                className="bg-black/15 p-3 rounded-lg border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">{ann.message}</span>
                </div>
                <div className="flex items-center gap-3 text-xs shrink-0 text-white/90">
                  <span className="inline-flex items-center gap-1 bg-black/20 px-2 py-1 rounded">
                    <TrendingDown className="w-3.5 h-3.5" />
                    Median WoW: <strong>{formatPct(ann.median_wow_change_pct)}</strong>
                  </span>
                  <span className="inline-flex items-center gap-1 bg-black/20 px-2 py-1 rounded">
                    Accounts considered: <strong>{ann.accounts_considered}</strong>
                  </span>
                </div>
              </div>
            ))}
          </div>

          <p className="text-xs text-amber-100 opacity-90 italic">
            Note: Correlated drop across accounts often points to external factors (e.g. holidays, product outages, major platform migrations) rather than isolated customer churn.
          </p>
        </div>
      </div>
    </div>
  );
};
