import React, { useState } from 'react';
import {
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  ShieldAlert,
  Bot,
  FileText,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { AgentBriefingResponse, Tier } from '../types';
import { TIER_CONFIG } from '../utils/formatters';

interface WeeklyBriefingCardProps {
  dataset: string;
  briefing: AgentBriefingResponse | null;
  isLoading: boolean;
  onGenerate: (forceTemplate: boolean, refresh: boolean) => void;
  onSelectAccount?: (accountId: string) => void;
}

export const WeeklyBriefingCard: React.FC<WeeklyBriefingCardProps> = ({
  dataset,
  briefing,
  isLoading,
  onGenerate,
  onSelectAccount,
}) => {
  const [forceTemplate, setForceTemplate] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden mb-6 transition-all">
      {/* Header Bar */}
      <div className="px-6 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-white tracking-tight">
                CS Weekly Intelligence Briefing
              </h2>
              <span className="text-[10px] font-bold uppercase tracking-wider bg-indigo-400/20 border border-indigo-300/30 text-indigo-200 px-2 py-0.5 rounded-full">
                AI Showcase
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-0.5">
              Actionable synthesis of top churn risks with root-cause hypotheses and CS questions
            </p>
          </div>
        </div>

        {/* Actions & Toggles */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Force Template toggle */}
          <label className="inline-flex items-center gap-2 text-xs text-slate-300 cursor-pointer bg-slate-800/80 px-2.5 py-1.5 rounded-lg border border-slate-700 hover:border-slate-600 transition-colors">
            <input
              type="checkbox"
              checked={forceTemplate}
              onChange={(e) => setForceTemplate(e.target.checked)}
              className="rounded border-slate-600 text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span>Force template</span>
          </label>

          {/* Action buttons */}
          {!briefing ? (
            <button
              type="button"
              onClick={() => onGenerate(forceTemplate, false)}
              disabled={isLoading}
              className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-medium text-xs px-3.5 py-2 rounded-lg shadow-sm transition-all disabled:opacity-60 cursor-pointer"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Asking the analyst agent...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Generate weekly briefing</span>
                </>
              )}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => onGenerate(forceTemplate, true)}
                disabled={isLoading}
                className="inline-flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium text-xs px-3 py-1.5 rounded-lg border border-slate-700 transition-all disabled:opacity-60 cursor-pointer"
                title="Regenerate briefing fresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Regenerate</span>
              </button>
              <button
                type="button"
                onClick={() => setCollapsed(!collapsed)}
                className="p-1.5 text-slate-400 hover:text-white rounded-md hover:bg-slate-800 transition-colors"
                title={collapsed ? 'Expand briefing' : 'Collapse briefing'}
              >
                {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      {isLoading ? (
        <div className="p-8 text-center space-y-4">
          <div className="inline-flex p-3 rounded-full bg-indigo-50 text-indigo-600 animate-spin">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-slate-800">
              Asking the analyst agent...
            </h4>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Analyzing login trajectories, validating claims against engine numbers, and synthesizing CS outreach priorities (takes up to 20s).
            </p>
          </div>
        </div>
      ) : !briefing ? (
        <div className="p-6 text-center text-slate-500 space-y-2 bg-slate-50/50">
          <Bot className="w-8 h-8 mx-auto text-slate-400" />
          <p className="text-sm font-medium text-slate-700">No briefing generated yet</p>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Click <strong>&quot;Generate weekly briefing&quot;</strong> above to produce an AI-powered or deterministic template briefing for dataset <code>{dataset}</code>.
          </p>
        </div>
      ) : !collapsed ? (
        <div className="p-6 space-y-6">
          {/* Metadata badges strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
            {/* Source Badge */}
            <div className="flex items-center gap-2">
              {briefing.source === 'llm' ? (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 border border-indigo-200">
                  <Bot className="w-3.5 h-3.5" />
                  <span>AI ({briefing.model || 'Gemini'})</span>
                  {briefing.cached && (
                    <span className="bg-indigo-200/70 text-indigo-900 text-[10px] px-1.5 py-0.2 rounded-full uppercase">
                      cached
                    </span>
                  )}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 border border-slate-200">
                  <FileText className="w-3.5 h-3.5 text-slate-500" />
                  <span>Template (not AI)</span>
                </span>
              )}

              {/* Validation Checkmark */}
              {briefing.validated && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Numbers verified against engine</span>
                </span>
              )}
            </div>

            {/* Fallback reason if any */}
            {briefing.fallback_reason && (
              <span className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-md flex items-center gap-1.5">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>AI unavailable: {briefing.fallback_reason}</span>
              </span>
            )}
          </div>

          {/* Headline */}
          <div className="text-lg font-bold text-slate-900 leading-snug">
            {briefing.headline}
          </div>

          {/* Priority Rows */}
          <div className="space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Ranked Action Priorities ({briefing.priorities.length})
            </h3>

            <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              {briefing.priorities.map((item, idx) => {
                const tierCfg = TIER_CONFIG[item.tier as Tier] || TIER_CONFIG.WATCH;

                return (
                  <div
                    key={item.account_id || idx}
                    className="p-4 hover:bg-slate-50/70 transition-colors bg-white space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5">
                        <span className="text-xs font-mono font-bold text-slate-400">
                          #{idx + 1}
                        </span>
                        <span
                          className={`text-xs font-bold px-2 py-0.5 rounded border ${tierCfg.badgeBg} ${tierCfg.badgeText} ${tierCfg.border}`}
                        >
                          {tierCfg.displayName}
                        </span>
                        <h4 className="text-sm font-bold text-slate-900">
                          {item.account_name}{' '}
                          <span className="text-xs font-mono font-normal text-slate-400">
                            ({item.account_id})
                          </span>
                        </h4>
                      </div>

                      {onSelectAccount && (
                        <button
                          type="button"
                          onClick={() => onSelectAccount(item.account_id)}
                          className="text-xs font-medium text-sky-600 hover:text-sky-800 flex items-center gap-1 hover:underline cursor-pointer"
                        >
                          <span>Show working</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Why & Next Step */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                      <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                        <span className="font-semibold text-slate-700 block mb-1">
                          Why it was flagged:
                        </span>
                        <p className="text-slate-600 leading-relaxed">{item.why}</p>
                      </div>

                      <div className="bg-sky-50/60 p-3 rounded-lg border border-sky-100">
                        <span className="font-semibold text-sky-900 block mb-1">
                          Recommended next step:
                        </span>
                        <p className="text-sky-800 leading-relaxed">{item.next_step}</p>
                      </div>
                    </div>

                    {/* Questions to ask */}
                    {item.questions && item.questions.length > 0 && (
                      <div className="bg-amber-50/40 p-3 rounded-lg border border-amber-200/60">
                        <span className="font-semibold text-amber-900 text-xs flex items-center gap-1.5 mb-1.5">
                          <HelpCircle className="w-3.5 h-3.5 text-amber-600" />
                          <span>Questions to ask the customer / account team:</span>
                        </span>
                        <ul className="list-disc list-inside text-xs text-amber-950 space-y-1">
                          {item.questions.map((q, qIdx) => (
                            <li key={qIdx} className="leading-relaxed">
                              {q}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Briefing Note */}
          {briefing.note && (
            <div className="pt-2 text-xs text-slate-500 italic border-t border-slate-100 flex items-start gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
              <span>{briefing.note}</span>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
};
