import React, { useState, useEffect } from 'react';
import {
  X,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  TrendingDown,
  Activity,
  Layers,
  Shield,
  FileText,
  Bot,
  Flame,
  Info,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import {
  AccountResult,
  AccountDetailResponse,
  ConfigResponse,
  AgentBriefingResponse,
} from '../types';
import { TIER_CONFIG, formatPct, formatNumber } from '../utils/formatters';
import { api } from '../api';

interface AccountDetailDrawerProps {
  account: AccountResult | null;
  dataset: string;
  config: ConfigResponse | null;
  onClose: () => void;
}

export const AccountDetailDrawer: React.FC<AccountDetailDrawerProps> = ({
  account,
  dataset,
  config,
  onClose,
}) => {
  const [detail, setDetail] = useState<AccountDetailResponse | null>(null);
  const [outreachBrief, setOutreachBrief] = useState<AgentBriefingResponse | null>(null);
  const [isGeneratingBrief, setIsGeneratingBrief] = useState(false);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [forceTemplate, setForceTemplate] = useState(false);

  // Load account detail with replay when selected
  useEffect(() => {
    if (!account) {
      setDetail(null);
      setOutreachBrief(null);
      setBriefError(null);
      return;
    }

    let active = true;
    setOutreachBrief(null);
    setBriefError(null);

    api
      .getAccount(account.account_id, dataset)
      .then((res) => {
        if (active) {
          setDetail(res);
        }
      })
      .catch((err) => {
        if (active) {
          console.error('Failed to load account detail:', err);
        }
      });

    return () => {
      active = false;
    };
  }, [account, dataset]);

  if (!account) return null;

  const currentData = detail || account;
  const tierCfg = TIER_CONFIG[currentData.tier] || TIER_CONFIG.ERROR;
  const definitions = config?.definitions;

  // Chart data preparation
  const chartData = (currentData.weekly_logins || []).map((val, idx) => ({
    week: idx + 1,
    logins: val,
  }));

  const windows = currentData.windows;
  // Windows are zero-based inclusive week indexes -> convert to 1-based for chart
  const onboardingRange = windows?.onboarding
    ? [windows.onboarding[0] + 1, windows.onboarding[1] + 1]
    : null;
  const baselineRange = windows?.baseline
    ? [windows.baseline[0] + 1, windows.baseline[1] + 1]
    : null;
  const recentRange = windows?.recent
    ? [windows.recent[0] + 1, windows.recent[1] + 1]
    : null;

  const handleGenerateOutreachBrief = async (refresh: boolean = false) => {
    setIsGeneratingBrief(true);
    setBriefError(null);
    try {
      const mode = forceTemplate ? 'template' : 'auto';
      const brief = await api.getAgentAccountBrief(account.account_id, dataset, mode, refresh);
      setOutreachBrief(brief);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to generate brief';
      setBriefError(msg);
    } finally {
      setIsGeneratingBrief(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-white shadow-2xl h-full flex flex-col border-l border-slate-200 overflow-hidden">
        {/* Drawer Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border ${tierCfg.badgeBg} ${tierCfg.badgeText} ${tierCfg.border}`}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={{ backgroundColor: tierCfg.hexColor }}
              />
              <span>{tierCfg.displayName}</span>
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900 leading-tight">
                {currentData.account_name}
              </h2>
              <div className="flex items-center gap-2 text-xs text-slate-500 font-mono mt-0.5">
                <span>{currentData.account_id}</span>
                <span>•</span>
                <span className="capitalize">{currentData.plan_tier} Plan</span>
                <span>•</span>
                <span>{currentData.weeks_of_history} Weeks History</span>
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Section 1: Full-size Chart */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Weekly Login Activity & Analysis Windows
                </h3>
                <p className="text-[11px] text-slate-500">
                  Weeks 1-{chartData.length} showing onboarding, baseline and recent evaluation windows
                </p>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 text-[11px]">
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-slate-300 inline-block" /> Onboarding
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-blue-300 inline-block" /> Baseline
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2.5 h-2.5 rounded bg-rose-300 inline-block" /> Recent (Last 4)
                </span>
                {currentData.baseline_level !== null && (
                  <span className="flex items-center gap-1">
                    <span className="w-3 border-t-2 border-dashed border-sky-600 inline-block" /> Baseline Median
                  </span>
                )}
              </div>
            </div>

            {chartData.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={chartData}
                    margin={{ top: 10, right: 20, left: -10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis
                      dataKey="week"
                      tickLine={false}
                      stroke="#94a3b8"
                      tick={{ fontSize: 11 }}
                      label={{ value: 'Week', position: 'insideBottomRight', offset: -4, fontSize: 10, fill: '#64748b' }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      tickLine={false}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (active && payload && payload.length) {
                          return (
                            <div className="bg-slate-900 text-white p-2.5 rounded-lg shadow-lg text-xs space-y-1">
                              <p className="font-semibold text-slate-300">Week {label}</p>
                              <p className="font-bold text-sky-400">
                                Logins: {payload[0].value}
                              </p>
                              {currentData.baseline_level !== null && (
                                <p className="text-slate-400 text-[10px]">
                                  Baseline median: {formatNumber(currentData.baseline_level)}
                                </p>
                              )}
                            </div>
                          );
                        }
                        return null;
                      }}
                    />

                    {/* Window Reference Areas */}
                    {onboardingRange && (
                      <ReferenceArea
                        x1={onboardingRange[0]}
                        x2={onboardingRange[1]}
                        fill="#cbd5e1"
                        fillOpacity={0.35}
                      />
                    )}
                    {baselineRange && (
                      <ReferenceArea
                        x1={baselineRange[0]}
                        x2={baselineRange[1]}
                        fill="#93c5fd"
                        fillOpacity={0.35}
                      />
                    )}
                    {recentRange && (
                      <ReferenceArea
                        x1={recentRange[0]}
                        x2={recentRange[1]}
                        fill="#fda4af"
                        fillOpacity={0.35}
                      />
                    )}

                    {/* Horizontal Baseline Median Line */}
                    {currentData.baseline_level !== null && (
                      <ReferenceLine
                        y={currentData.baseline_level}
                        stroke="#0284c7"
                        strokeDasharray="4 4"
                        strokeWidth={1.5}
                        label={{
                          value: `Baseline: ${formatNumber(currentData.baseline_level)}`,
                          position: 'insideTopLeft',
                          fill: '#0369a1',
                          fontSize: 10,
                          fontWeight: 'bold',
                        }}
                      />
                    )}

                    {/* Sudden Cliff Line */}
                    {currentData.cliff_week !== null && currentData.cliff_week !== undefined && (
                      <ReferenceLine
                        x={currentData.cliff_week}
                        stroke="#dc2626"
                        strokeWidth={2}
                        label={{
                          value: `Cliff (W${currentData.cliff_week})`,
                          position: 'top',
                          fill: '#dc2626',
                          fontSize: 10,
                          fontWeight: 'bold',
                        }}
                      />
                    )}

                    <Line
                      type="monotone"
                      dataKey="logins"
                      stroke="#0f172a"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: '#0f172a' }}
                      activeDot={{ r: 5, fill: '#0284c7' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-400 text-sm">
                No weekly login data available
              </div>
            )}
          </div>

          {/* Section 2: "How the engine decided" panel */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4 shadow-2xs">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-sky-600" />
                <h3 className="font-bold text-slate-900 text-sm">
                  How the Engine Decided
                </h3>
              </div>
              <span className="text-[11px] font-mono font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                Reason Code: {currentData.reason_code || 'n/a'}
              </span>
            </div>

            {/* Step-by-step numbers grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              {/* Baseline Level */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                <div className="text-slate-500 font-medium text-[11px] flex items-center justify-between">
                  <span>Baseline Level</span>
                  <Info className="w-3 h-3 text-slate-400" />
                </div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {formatNumber(currentData.baseline_level)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                  {definitions?.baseline_level || 'Median of baseline window'}
                </div>
              </div>

              {/* Recent Level */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                <div className="text-slate-500 font-medium text-[11px] flex items-center justify-between">
                  <span>Recent Level</span>
                  <Info className="w-3 h-3 text-slate-400" />
                </div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {formatNumber(currentData.recent_level)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                  {definitions?.recent_level || 'Mean of last 4 weeks'}
                </div>
              </div>

              {/* Drop % */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                <div className="text-slate-500 font-medium text-[11px] flex items-center justify-between">
                  <span>Drop %</span>
                  <TrendingDown className="w-3 h-3 text-slate-400" />
                </div>
                <div
                  className={`text-lg font-bold mt-1 ${
                    currentData.drop_pct && currentData.drop_pct <= -30
                      ? 'text-red-600'
                      : 'text-slate-900'
                  }`}
                >
                  {formatPct(currentData.drop_pct)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                  {definitions?.drop || 'recent / baseline - 1'}
                </div>
              </div>

              {/* Last-2 % */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                <div className="text-slate-500 font-medium text-[11px] flex items-center justify-between">
                  <span>Last-2 %</span>
                  <Activity className="w-3 h-3 text-slate-400" />
                </div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {formatPct(currentData.last2_drop_pct)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                  {definitions?.last2_drop || 'Persistence check'}
                </div>
              </div>

              {/* Noise % */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                <div className="text-slate-500 font-medium text-[11px]">Noise %</div>
                <div className="text-lg font-bold text-slate-900 mt-1">
                  {formatPct(currentData.noise_pct)}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                  {definitions?.noise || 'Baseline coeff of variation'}
                </div>
              </div>

              {/* Confidence */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                <div className="text-slate-500 font-medium text-[11px]">Confidence</div>
                <div className="text-base font-bold text-slate-900 mt-1">
                  {currentData.confidence || 'n/a'}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                  Based on baseline depth
                </div>
              </div>

              {/* Pattern */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                <div className="text-slate-500 font-medium text-[11px]">Pattern</div>
                <div className="text-sm font-bold text-slate-900 mt-1">
                  {currentData.pattern ? (
                    <span className="flex items-center gap-1">
                      {currentData.pattern === 'sudden_cliff' ? (
                        <>
                          <Flame className="w-3.5 h-3.5 text-red-500" />
                          <span>Sudden Cliff</span>
                        </>
                      ) : (
                        <span>Slow Erosion</span>
                      )}
                    </span>
                  ) : (
                    'None'
                  )}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                  {currentData.cliff_week ? `Cliff at week ${currentData.cliff_week}` : 'Gradual trajectory'}
                </div>
              </div>

              {/* Tier & Rule */}
              <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                <div className="text-slate-500 font-medium text-[11px]">Classified Tier</div>
                <div
                  className="text-base font-bold mt-1"
                  style={{ color: tierCfg.hexColor }}
                >
                  {tierCfg.displayName}
                </div>
                <div className="text-[10px] text-slate-500 mt-0.5 leading-tight">
                  Deterministic engine rule
                </div>
              </div>
            </div>

            {/* Applicable Tier Rule text */}
            {definitions?.tiers && definitions.tiers[currentData.tier] && (
              <div className="bg-slate-100/70 p-3 rounded-lg border border-slate-200 text-xs">
                <span className="font-semibold text-slate-700">Triggered rule: </span>
                <code className="text-slate-800 font-mono bg-white px-1.5 py-0.5 rounded border border-slate-200">
                  {definitions.tiers[currentData.tier]}
                </code>
              </div>
            )}

            {/* Reason & Recommended Action */}
            <div className="space-y-2 pt-2 border-t border-slate-100 text-xs">
              <div>
                <span className="font-semibold text-slate-800 block mb-1">
                  Engine Classification Reason:
                </span>
                <p className="text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80 leading-relaxed">
                  {currentData.reason}
                </p>
              </div>

              {currentData.recommended_action && (
                <div>
                  <span className="font-semibold text-sky-900 block mb-1">
                    Recommended Action:
                  </span>
                  <p className="text-sky-800 bg-sky-50/70 p-2.5 rounded-lg border border-sky-100 leading-relaxed font-medium">
                    {currentData.recommended_action}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: "Replay" strip from the replay timeline */}
          {detail?.replay && (
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3 shadow-2xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <h3 className="font-bold text-slate-900 text-sm">
                    Historical Replay Timeline
                  </h3>
                </div>
                <span className="text-[11px] text-slate-500">
                  Week-by-week tier evaluation
                </span>
              </div>

              {/* Replay timeline grid */}
              <div className="overflow-x-auto pb-1">
                <div className="flex items-center gap-1 min-w-max">
                  {detail.replay.timeline.map((step) => {
                    const stepCfg = TIER_CONFIG[step.tier] || TIER_CONFIG.TOO_NEW;
                    const isFirstAlert = detail.replay?.first_alert_week === step.week;

                    return (
                      <div
                        key={step.week}
                        className="flex flex-col items-center gap-1"
                        title={`Week ${step.week}: ${stepCfg.displayName}`}
                      >
                        <span className="text-[9px] font-mono text-slate-400">
                          W{step.week}
                        </span>
                        <div
                          className={`w-7 h-7 rounded flex items-center justify-center text-[10px] font-bold text-white shadow-2xs relative ${
                            isFirstAlert ? 'ring-2 ring-red-500 ring-offset-1' : ''
                          }`}
                          style={{ backgroundColor: stepCfg.hexColor }}
                        >
                          {step.week}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Replay Caption */}
              <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                {detail.replay.first_alert_week ? (
                  <span>
                    RetainIQ first alerted in <strong>week {detail.replay.first_alert_week}</strong>
                    {detail.replay.first_alert_tier ? ` (${detail.replay.first_alert_tier})` : ''}.
                  </span>
                ) : (
                  <span>No alerts triggered for this account across all evaluated weeks.</span>
                )}
              </div>
            </div>
          )}

          {/* Section 4: Outreach Brief (AI Showcase for this account) */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
            <div className="px-5 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-300" />
                <h3 className="font-bold text-sm text-white">
                  Customer Outreach Brief
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <label className="inline-flex items-center gap-1.5 text-xs text-slate-300 cursor-pointer bg-slate-800/80 px-2 py-1 rounded border border-slate-700">
                  <input
                    type="checkbox"
                    checked={forceTemplate}
                    onChange={(e) => setForceTemplate(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-0"
                  />
                  <span>Force template</span>
                </label>

                <button
                  type="button"
                  onClick={() => handleGenerateOutreachBrief(!!outreachBrief)}
                  disabled={isGeneratingBrief}
                  className="inline-flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs px-3 py-1.5 rounded-lg shadow-sm transition-all disabled:opacity-60 cursor-pointer"
                >
                  {isGeneratingBrief ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Asking the analyst agent...</span>
                    </>
                  ) : outreachBrief ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Regenerate</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate outreach brief</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Brief Content */}
            {isGeneratingBrief ? (
              <div className="p-8 text-center space-y-3">
                <div className="inline-flex p-3 rounded-full bg-indigo-50 text-indigo-600 animate-spin">
                  <RefreshCw className="w-5 h-5" />
                </div>
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-slate-800">
                    Asking the analyst agent...
                  </p>
                  <p className="text-[11px] text-slate-500 max-w-sm mx-auto">
                    Synthesizing account context, verifying claims, and generating tailored outreach questions (takes up to 20s).
                  </p>
                </div>
              </div>
            ) : briefError ? (
              <div className="p-4 bg-red-50 border-t border-red-200 text-xs text-red-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
                <span>{briefError}</span>
              </div>
            ) : outreachBrief ? (
              <div className="p-5 space-y-4">
                {/* Meta badges */}
                <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    {outreachBrief.source === 'llm' ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                        <Bot className="w-3 h-3" />
                        <span>AI ({outreachBrief.model || 'Gemini'})</span>
                        {outreachBrief.cached && (
                          <span className="text-[9px] uppercase px-1 rounded bg-indigo-200/80">
                            cached
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        <FileText className="w-3 h-3 text-slate-500" />
                        <span>Template (not AI)</span>
                      </span>
                    )}

                    {outreachBrief.validated && (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        <span>Numbers verified against engine</span>
                      </span>
                    )}
                  </div>

                  {outreachBrief.fallback_reason && (
                    <span className="text-[11px] text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 text-amber-600" />
                      <span>AI unavailable: {outreachBrief.fallback_reason}</span>
                    </span>
                  )}
                </div>

                {/* Headline */}
                <h4 className="text-sm font-bold text-slate-900">
                  {outreachBrief.headline}
                </h4>

                {/* Priorities (focused on this account) */}
                <div className="space-y-3">
                  {outreachBrief.priorities.map((item, i) => (
                    <div key={i} className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                        <div className="bg-white p-3 rounded-lg border border-slate-200">
                          <span className="font-semibold text-slate-800 block mb-1">
                            Why it was flagged:
                          </span>
                          <p className="text-slate-600 leading-relaxed">{item.why}</p>
                        </div>
                        <div className="bg-sky-50/70 p-3 rounded-lg border border-sky-100">
                          <span className="font-semibold text-sky-900 block mb-1">
                            Recommended next step:
                          </span>
                          <p className="text-sky-800 leading-relaxed">{item.next_step}</p>
                        </div>
                      </div>

                      {item.questions && item.questions.length > 0 && (
                        <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-200/60">
                          <span className="font-semibold text-amber-900 text-xs flex items-center gap-1.5 mb-1.5">
                            <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                            <span>Outreach questions:</span>
                          </span>
                          <ul className="list-disc list-inside text-xs text-amber-950 space-y-1">
                            {item.questions.map((q, qIdx) => (
                              <li key={qIdx}>{q}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {outreachBrief.note && (
                  <div className="text-[11px] text-slate-500 italic pt-2 border-t border-slate-100">
                    {outreachBrief.note}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6 text-center text-slate-500 space-y-1.5">
                <Bot className="w-7 h-7 mx-auto text-slate-400" />
                <p className="text-xs font-semibold text-slate-700">
                  Generate a tailored outreach brief for this customer
                </p>
                <p className="text-[11px] text-slate-400">
                  Click the button above to ask the analyst agent or generate a deterministic outreach outline.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
