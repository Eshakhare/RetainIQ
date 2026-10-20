import React from 'react';
import {
  ShieldAlert,
  RefreshCw,
  Play,
} from 'lucide-react';
import { DatasetItem } from '../types';

interface HeaderProps {
  datasets: DatasetItem[];
  selectedDataset: string;
  onSelectDataset: (id: string) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  health?: any;
  healthLoading?: boolean;
  healthError?: boolean;
  onBaseUrlChange?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  datasets,
  selectedDataset,
  onSelectDataset,
  onAnalyze,
  isAnalyzing,
}) => {
  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-2xs">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Brand Logo & Title */}
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-sky-600 to-indigo-600 flex items-center justify-center shadow-xs">
              <ShieldAlert className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-black text-slate-900 text-lg tracking-tight">
                  Retain<span className="text-sky-600">IQ</span>
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-sky-50 text-sky-700 border border-sky-200 uppercase tracking-wider">
                  v1.0
                </span>
              </div>
              <p className="text-[11px] text-slate-500 hidden sm:block">
                Predictive Churn Risk Engine • Vantage Retail Systems
              </p>
            </div>
          </div>

          {/* Controls: Dataset Selector + Run Button */}
          <div className="flex items-center gap-3">
            {/* Dataset Selector */}
            <div className="relative">
              <select
                value={selectedDataset}
                onChange={(e) => onSelectDataset(e.target.value)}
                disabled={isAnalyzing}
                className="appearance-none text-xs bg-slate-50 hover:bg-slate-100 text-slate-800 font-medium py-1.5 pl-3 pr-8 rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-sky-500 cursor-pointer disabled:opacity-50 transition-colors"
                title="Select dataset to analyze"
              >
                {datasets.map((ds) => (
                  <option key={ds.id} value={ds.id}>
                    {ds.name} ({ds.accounts} {ds.accounts === 1 ? 'account' : 'accounts'})
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-slate-500">
                <svg className="fill-current h-3 w-3" viewBox="0 0 20 20">
                  <path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" />
                </svg>
              </div>
            </div>

            {/* Run / Re-Analyze Button */}
            <button
              type="button"
              onClick={onAnalyze}
              disabled={isAnalyzing}
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold shadow-xs transition-all disabled:opacity-60 cursor-pointer"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-white" />
                  <span>Analyze</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};
