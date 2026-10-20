import React, { useState, useEffect } from 'react';
import {
  AccountResult,
  ConfigResponse,
  AnalyzeResponse,
  Tier,
} from '../../types';
import { TIER_CONFIG } from '../../utils/formatters';
import { api, ApiError } from '../../api';
import {
  Sliders,
  Play,
  RotateCcw,
  Plus,
  Trash2,
  AlertCircle,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

interface WhatIfTabProps {
  currentResults: AccountResult[];
  config: ConfigResponse | null;
  selectedDataset: string;
}

interface EditableAccount {
  account_id: string;
  account_name: string;
  plan_tier: string;
  weekly_logins_str: string;
}

export const WhatIfTab: React.FC<WhatIfTabProps> = ({
  currentResults,
  config,
  selectedDataset,
}) => {
  // Threshold overrides
  const initialThresholds = {
    critical_drop: config?.thresholds.critical_drop ?? -0.5,
    at_risk_drop: config?.thresholds.at_risk_drop ?? -0.3,
    watch_drop: config?.thresholds.watch_drop ?? -0.15,
    at_risk_last2: config?.thresholds.at_risk_last2 ?? -0.3,
    watch_last2: config?.thresholds.watch_last2 ?? -0.1,
    min_weeks_to_score: config?.thresholds.min_weeks_to_score ?? 10,
    noise_multiplier: config?.thresholds.noise_multiplier ?? 2.0,
  };

  const [thresholds, setThresholds] = useState(initialThresholds);

  // Accounts list (editable)
  const [accounts, setAccounts] = useState<EditableAccount[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [simulatedReport, setSimulatedReport] = useState<AnalyzeResponse | null>(null);

  // Preload accounts from currentResults
  useEffect(() => {
    if (currentResults && currentResults.length > 0) {
      setAccounts(
        currentResults.map((r) => ({
          account_id: r.account_id,
          account_name: r.account_name,
          plan_tier: r.plan_tier || 'starter',
          weekly_logins_str: (r.weekly_logins || []).join(', '),
        }))
      );
    }
  }, [currentResults]);

  // Update thresholds if config loads
  useEffect(() => {
    if (config?.thresholds) {
      setThresholds({
        critical_drop: config.thresholds.critical_drop ?? -0.5,
        at_risk_drop: config.thresholds.at_risk_drop ?? -0.3,
        watch_drop: config.thresholds.watch_drop ?? -0.15,
        at_risk_last2: config.thresholds.at_risk_last2 ?? -0.3,
        watch_last2: config.thresholds.watch_last2 ?? -0.1,
        min_weeks_to_score: config.thresholds.min_weeks_to_score ?? 10,
        noise_multiplier: config.thresholds.noise_multiplier ?? 2.0,
      });
    }
  }, [config]);

  const handleAddCustomAccount = () => {
    const nextNum = accounts.length + 1;
    const newId = `CUST-${String(nextNum).padStart(2, '0')}`;
    setAccounts([
      ...accounts,
      {
        account_id: newId,
        account_name: `Custom Account ${nextNum}`,
        plan_tier: 'enterprise',
        weekly_logins_str: '45, 48, 50, 52, 49, 51, 47, 50, 32, 28, 20, 15',
      },
    ]);
  };

  const handleRemoveAccount = (id: string) => {
    setAccounts(accounts.filter((a) => a.account_id !== id));
  };

  const handleAccountChange = (id: string, field: keyof EditableAccount, val: string) => {
    setAccounts(
      accounts.map((a) => {
        if (a.account_id === id) {
          return { ...a, [field]: val };
        }
        return a;
      })
    );
  };

  const handleReset = () => {
    if (config?.thresholds) {
      setThresholds({
        critical_drop: config.thresholds.critical_drop ?? -0.5,
        at_risk_drop: config.thresholds.at_risk_drop ?? -0.3,
        watch_drop: config.thresholds.watch_drop ?? -0.15,
        at_risk_last2: config.thresholds.at_risk_last2 ?? -0.3,
        watch_last2: config.thresholds.watch_last2 ?? -0.1,
        min_weeks_to_score: config.thresholds.min_weeks_to_score ?? 10,
        noise_multiplier: config.thresholds.noise_multiplier ?? 2.0,
      });
    }
    if (currentResults && currentResults.length > 0) {
      setAccounts(
        currentResults.map((r) => ({
          account_id: r.account_id,
          account_name: r.account_name,
          plan_tier: r.plan_tier || 'starter',
          weekly_logins_str: (r.weekly_logins || []).join(', '),
        }))
      );
    }
    setValidationError(null);
    setSimulatedReport(null);
  };

  const handleReRun = async () => {
    setIsRunning(true);
    setValidationError(null);

    // Parse accounts
    const parsedAccounts = [];
    for (const a of accounts) {
      const logins = a.weekly_logins_str
        .split(',')
        .map((s) => s.trim())
        .filter((s) => s.length > 0)
        .map((s) => Number(s));

      parsedAccounts.push({
        account_id: a.account_id,
        account_name: a.account_name,
        plan_tier: a.plan_tier,
        weekly_logins: logins,
      });
    }

    // Determine config overrides (only send changed keys)
    const baseThresh = config?.thresholds || {};
    const config_overrides: Record<string, number> = {};
    if (thresholds.critical_drop !== baseThresh.critical_drop) {
      config_overrides.critical_drop = thresholds.critical_drop;
    }
    if (thresholds.at_risk_drop !== baseThresh.at_risk_drop) {
      config_overrides.at_risk_drop = thresholds.at_risk_drop;
    }
    if (thresholds.watch_drop !== baseThresh.watch_drop) {
      config_overrides.watch_drop = thresholds.watch_drop;
    }
    if (thresholds.at_risk_last2 !== baseThresh.at_risk_last2) {
      config_overrides.at_risk_last2 = thresholds.at_risk_last2;
    }
    if (thresholds.watch_last2 !== baseThresh.watch_last2) {
      config_overrides.watch_last2 = thresholds.watch_last2;
    }
    if (thresholds.min_weeks_to_score !== baseThresh.min_weeks_to_score) {
      config_overrides.min_weeks_to_score = thresholds.min_weeks_to_score;
    }
    if (thresholds.noise_multiplier !== baseThresh.noise_multiplier) {
      config_overrides.noise_multiplier = thresholds.noise_multiplier;
    }

    try {
      const report = await api.analyze({
        dataset: selectedDataset,
        accounts: parsedAccounts,
        config_overrides: Object.keys(config_overrides).length > 0 ? config_overrides : undefined,
      });
      setSimulatedReport(report);
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        setValidationError(`[${err.code}] ${err.message}`);
      } else {
        setValidationError(err instanceof Error ? err.message : 'Unknown simulation error');
      }
    } finally {
      setIsRunning(false);
    }
  };

  // Compare original vs simulated
  const originalMap = new Map(currentResults.map((r) => [r.account_id, r]));
  const tierChanges: Array<{
    id: string;
    name: string;
    oldTier: Tier;
    newTier: Tier;
    newRank: number;
    oldRank?: number;
  }> = [];

  if (simulatedReport) {
    for (const res of simulatedReport.results) {
      const orig = originalMap.get(res.account_id);
      if (orig && orig.tier !== res.tier) {
        tierChanges.push({
          id: res.account_id,
          name: res.account_name,
          oldTier: orig.tier,
          newTier: res.tier,
          newRank: res.rank,
          oldRank: orig.rank,
        });
      }
    }
  }

  return (
    <div className="space-y-6">
      {/* Intro Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">
            What-If Scenario Simulation
          </h3>
          <p className="text-xs text-slate-500">
            Modify weekly usage numbers, test custom accounts, or tune detection thresholds. Re-runs live against the FastAPI engine.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleReset}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          <button
            type="button"
            onClick={handleReRun}
            disabled={isRunning}
            className="inline-flex items-center gap-2 px-4 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold shadow-sm transition-all disabled:opacity-60 cursor-pointer"
          >
            {isRunning ? (
              <>
                <Sliders className="w-3.5 h-3.5 animate-spin" />
                <span>Simulating...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Re-run Simulation</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Validation Error banner (inline) */}
      {validationError && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Validation Error:</span> {validationError}
          </div>
        </div>
      )}

      {/* Threshold Controls */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-sky-600" />
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
              Tune Engine Detection Thresholds
            </h4>
          </div>
          <span className="text-[11px] text-slate-400">
            Rules enforce: critical_drop &le; at_risk_drop &le; watch_drop &lt; 0
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Critical Drop */}
          <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
            <div className="flex justify-between font-semibold text-slate-700">
              <span>critical_drop</span>
              <span className="font-mono text-red-600 font-bold">
                {Math.round(thresholds.critical_drop * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="-1.0"
              max="-0.05"
              step="0.05"
              value={thresholds.critical_drop}
              onChange={(e) =>
                setThresholds({ ...thresholds, critical_drop: parseFloat(e.target.value) })
              }
              className="w-full accent-red-600 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400">Default: -50%</p>
          </div>

          {/* At-Risk Drop */}
          <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
            <div className="flex justify-between font-semibold text-slate-700">
              <span>at_risk_drop</span>
              <span className="font-mono text-orange-600 font-bold">
                {Math.round(thresholds.at_risk_drop * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="-1.0"
              max="-0.05"
              step="0.05"
              value={thresholds.at_risk_drop}
              onChange={(e) =>
                setThresholds({ ...thresholds, at_risk_drop: parseFloat(e.target.value) })
              }
              className="w-full accent-orange-600 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400">Default: -30%</p>
          </div>

          {/* Watch Drop */}
          <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
            <div className="flex justify-between font-semibold text-slate-700">
              <span>watch_drop</span>
              <span className="font-mono text-amber-600 font-bold">
                {Math.round(thresholds.watch_drop * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="-1.0"
              max="-0.01"
              step="0.01"
              value={thresholds.watch_drop}
              onChange={(e) =>
                setThresholds({ ...thresholds, watch_drop: parseFloat(e.target.value) })
              }
              className="w-full accent-amber-600 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400">Default: -15%</p>
          </div>

          {/* Noise Multiplier */}
          <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
            <div className="flex justify-between font-semibold text-slate-700">
              <span>noise_multiplier</span>
              <span className="font-mono text-slate-800 font-bold">
                {thresholds.noise_multiplier}x
              </span>
            </div>
            <input
              type="range"
              min="0.0"
              max="5.0"
              step="0.5"
              value={thresholds.noise_multiplier}
              onChange={(e) =>
                setThresholds({ ...thresholds, noise_multiplier: parseFloat(e.target.value) })
              }
              className="w-full accent-sky-600 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400">Default: 2.0x</p>
          </div>

          {/* At-Risk Last-2 */}
          <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
            <div className="flex justify-between font-semibold text-slate-700">
              <span>at_risk_last2</span>
              <span className="font-mono text-slate-800 font-bold">
                {Math.round(thresholds.at_risk_last2 * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="-1.0"
              max="0.0"
              step="0.05"
              value={thresholds.at_risk_last2}
              onChange={(e) =>
                setThresholds({ ...thresholds, at_risk_last2: parseFloat(e.target.value) })
              }
              className="w-full accent-slate-700 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400">Default: -30%</p>
          </div>

          {/* Watch Last-2 */}
          <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
            <div className="flex justify-between font-semibold text-slate-700">
              <span>watch_last2</span>
              <span className="font-mono text-slate-800 font-bold">
                {Math.round(thresholds.watch_last2 * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="-1.0"
              max="0.0"
              step="0.05"
              value={thresholds.watch_last2}
              onChange={(e) =>
                setThresholds({ ...thresholds, watch_last2: parseFloat(e.target.value) })
              }
              className="w-full accent-slate-700 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400">Default: -10%</p>
          </div>

          {/* Min Weeks to Score */}
          <div className="space-y-1.5 bg-slate-50 p-3 rounded-lg border border-slate-200/80">
            <div className="flex justify-between font-semibold text-slate-700">
              <span>min_weeks_to_score</span>
              <span className="font-mono text-slate-800 font-bold">
                {thresholds.min_weeks_to_score} wks
              </span>
            </div>
            <input
              type="range"
              min="6"
              max="20"
              step="1"
              value={thresholds.min_weeks_to_score}
              onChange={(e) =>
                setThresholds({ ...thresholds, min_weeks_to_score: parseInt(e.target.value, 10) })
              }
              className="w-full accent-slate-700 cursor-pointer"
            />
            <p className="text-[10px] text-slate-400">Default: 10 wks</p>
          </div>
        </div>
      </div>

      {/* Tier Changes Highlight Section (If re-run was performed) */}
      {simulatedReport && (
        <div className="bg-sky-50 border border-sky-200 p-4 rounded-xl space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-sky-700" />
              <h4 className="font-bold text-xs uppercase tracking-wider text-sky-950">
                Simulation Impact Summary
              </h4>
            </div>
            <span className="text-xs font-semibold text-sky-800">
              {tierChanges.length} tier {tierChanges.length === 1 ? 'change' : 'changes'} detected
            </span>
          </div>

          {tierChanges.length === 0 ? (
            <p className="text-xs text-sky-800">
              No account tiers changed with these threshold/data overrides.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
              {tierChanges.map((tc) => {
                const oldCfg = TIER_CONFIG[tc.oldTier];
                const newCfg = TIER_CONFIG[tc.newTier];

                return (
                  <div
                    key={tc.id}
                    className="bg-white p-2.5 rounded-lg border border-sky-200/80 flex items-center justify-between shadow-2xs text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{tc.name}</div>
                      <div className="text-[10px] font-mono text-slate-400">{tc.id}</div>
                    </div>
                    <div className="flex items-center gap-1.5 font-bold">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${oldCfg.badgeBg} ${oldCfg.badgeText}`}>
                        {tc.oldTier}
                      </span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span className={`px-1.5 py-0.5 rounded text-[10px] ${newCfg.badgeBg} ${newCfg.badgeText}`}>
                        {tc.newTier}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Account Data Editor */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900">
              Account Usage Data Input
            </h4>
            <p className="text-[11px] text-slate-500">
              Edit weekly login sequences (comma-separated integers) or add custom accounts
            </p>
          </div>
          <button
            type="button"
            onClick={handleAddCustomAccount}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 text-xs font-semibold text-slate-700 shadow-2xs cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Custom Account</span>
          </button>
        </div>

        <div className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {accounts.map((acc) => (
            <div
              key={acc.account_id}
              className="p-3.5 flex flex-col md:flex-row items-start md:items-center gap-3 hover:bg-slate-50/50"
            >
              {/* Account ID & Name */}
              <div className="w-full md:w-56 space-y-1">
                <input
                  type="text"
                  value={acc.account_name}
                  onChange={(e) => handleAccountChange(acc.account_id, 'account_name', e.target.value)}
                  className="w-full text-xs font-bold text-slate-900 px-2 py-1 border border-slate-200 rounded focus:ring-1 focus:ring-sky-500"
                />
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-mono text-slate-400">{acc.account_id}</span>
                  <select
                    value={acc.plan_tier}
                    onChange={(e) => handleAccountChange(acc.account_id, 'plan_tier', e.target.value)}
                    className="text-[10px] font-medium bg-slate-100 border border-slate-200 rounded px-1.5 py-0.5 capitalize"
                  >
                    <option value="enterprise">Enterprise</option>
                    <option value="growth">Growth</option>
                    <option value="starter">Starter</option>
                  </select>
                </div>
              </div>

              {/* Weekly Numbers Input */}
              <div className="flex-1 w-full">
                <label className="text-[10px] text-slate-400 block mb-0.5">
                  Weekly Logins (comma-separated):
                </label>
                <input
                  type="text"
                  value={acc.weekly_logins_str}
                  onChange={(e) => handleAccountChange(acc.account_id, 'weekly_logins_str', e.target.value)}
                  className="w-full text-xs font-mono px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded focus:bg-white focus:ring-1 focus:ring-sky-500"
                  placeholder="e.g. 50, 48, 52, 49, 45, 30, 20, 15"
                />
              </div>

              {/* Delete button */}
              <button
                type="button"
                onClick={() => handleRemoveAccount(acc.account_id)}
                className="text-slate-400 hover:text-red-600 p-1.5 rounded hover:bg-red-50"
                title="Remove account from simulation"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
