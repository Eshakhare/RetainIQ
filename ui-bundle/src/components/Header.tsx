import React, { useState } from 'react';
import {
  ShieldAlert,
  RefreshCw,
  Play,
  Settings,
  CheckCircle2,
  Sparkles,
  Server,
  X,
} from 'lucide-react';
import { HealthResponse, DatasetItem } from '../types';
import { getApiBaseUrl, setApiBaseUrl } from '../api';

interface HeaderProps {
  health: HealthResponse | null;
  healthLoading: boolean;
  healthError: boolean;
  datasets: DatasetItem[];
  selectedDataset: string;
  onSelectDataset: (id: string) => void;
  onAnalyze: () => void;
  isAnalyzing: boolean;
  onBaseUrlChange: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  health,
  healthLoading,
  healthError,
  datasets,
  selectedDataset,
  onSelectDataset,
  onAnalyze,
  isAnalyzing,
  onBaseUrlChange,
}) => {
  const [showSettings, setShowSettings] = useState(false);
  const [urlInput, setUrlInput] = useState(getApiBaseUrl());
  const [saveSuccess, setSaveSuccess] = useState(false);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setApiBaseUrl(urlInput);
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      setShowSettings(false);
      onBaseUrlChange();
    }, 500);
  };

  const handleResetSettings = () => {
    setUrlInput('http://127.0.0.1:8000');
    setApiBaseUrl('http://127.0.0.1:8000');
    setSaveSuccess(true);
    setTimeout(() => {
      setSaveSuccess(false);
      setShowSettings(false);
      onBaseUrlChange();
    }, 500);
  };

  return (
    <>
      <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 gap-4">
            {/* Logo and App Title */}
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-sky-500/20">
                <ShieldAlert className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-bold tracking-tight text-slate-900">RetainIQ</h1>
                  <span className="text-[10px] font-semibold uppercase tracking-wider bg-sky-50 text-sky-700 px-1.5 py-0.5 rounded border border-sky-200">
                    CS Dashboard
                  </span>
                </div>
                <p className="text-xs text-slate-500 hidden sm:block">
                  Churn-Risk Early-Warning Detection
                </p>
              </div>
            </div>

            {/* Middle: Dataset Selector & Analyze Button */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
                <label htmlFor="dataset-select" className="text-xs font-medium text-slate-600 pl-1.5">
                  Dataset:
                </label>
                <select
                  id="dataset-select"
                  value={selectedDataset}
                  onChange={(e) => onSelectDataset(e.target.value)}
                  disabled={isAnalyzing}
                  className="text-xs font-semibold bg-white border border-slate-300 rounded-md px-2.5 py-1 text-slate-800 shadow-2xs focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500 disabled:opacity-50 cursor-pointer"
                >
                  {datasets.length === 0 ? (
                    <option value="seed">seed (12 accounts)</option>
                  ) : (
                    datasets.map((ds) => (
                      <option key={ds.id} value={ds.id}>
                        {ds.name} ({ds.accounts} {ds.accounts === 1 ? 'account' : 'accounts'})
                      </option>
                    ))
                  )}
                </select>
              </div>

              {/* Big Analyze Button */}
              <button
                type="button"
                onClick={onAnalyze}
                disabled={isAnalyzing}
                className="inline-flex items-center gap-2 bg-sky-600 hover:bg-sky-700 active:bg-sky-800 text-white font-medium text-sm px-4 py-2 rounded-lg shadow-sm transition-all focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2 disabled:opacity-60 cursor-pointer"
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

            {/* Right: Health, AI badge, Settings */}
            <div className="flex items-center gap-3">
              {/* Backend Status Dot */}
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 text-xs text-slate-700 border border-slate-200"
                title={
                  healthError
                    ? 'Backend unavailable'
                    : health
                    ? `Backend ${health.status} (v${health.version})`
                    : 'Checking backend...'
                }
              >
                <span className="relative flex h-2 w-2">
                  {!healthError && !healthLoading && (
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  )}
                  <span
                    className={`relative inline-flex rounded-full h-2 w-2 ${
                      healthError
                        ? 'bg-red-500'
                        : healthLoading
                        ? 'bg-amber-400'
                        : 'bg-emerald-500'
                    }`}
                  ></span>
                </span>
                <span className="font-medium hidden md:inline">
                  {healthError ? 'Offline' : healthLoading ? 'Checking...' : 'API Online'}
                </span>
              </div>

              {/* AI Status Badge */}
              {health && (
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
                    health.llm_available
                      ? 'bg-purple-50 text-purple-700 border-purple-200'
                      : 'bg-slate-100 text-slate-600 border-slate-200'
                  }`}
                  title={
                    health.llm_available
                      ? 'AI LLM enabled (Gemini / Vertex AI connected)'
                      : 'AI model not configured; using high-fidelity deterministic template generation'
                  }
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{health.llm_available ? 'AI: on' : 'AI: template only'}</span>
                </div>
              )}

              {/* Settings button */}
              <button
                type="button"
                onClick={() => {
                  setUrlInput(getApiBaseUrl());
                  setShowSettings(true);
                }}
                className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg border border-transparent hover:border-slate-200 transition-colors"
                title="API Connection Settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-xs p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full border border-slate-200 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/70">
              <div className="flex items-center gap-2">
                <Server className="w-5 h-5 text-sky-600" />
                <h3 className="font-semibold text-slate-900">API Connection Settings</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="text-slate-400 hover:text-slate-600 rounded-md p-1"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Backend API Base URL
                </label>
                <input
                  type="text"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="http://127.0.0.1:8000"
                  className="w-full text-sm font-mono px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                  required
                />
                <p className="text-xs text-slate-500 mt-1.5">
                  Default: <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">http://127.0.0.1:8000</code>
                </p>
              </div>

              {saveSuccess && (
                <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 bg-emerald-50 p-2.5 rounded-lg border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Saved! Reconnecting...</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleResetSettings}
                  className="text-xs font-medium text-slate-600 hover:text-slate-800 underline"
                >
                  Reset to default
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setShowSettings(false)}
                    className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 text-xs font-medium text-white bg-sky-600 hover:bg-sky-700 rounded-lg shadow-xs"
                  >
                    Save URL
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
};
