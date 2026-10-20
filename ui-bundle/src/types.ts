export type Tier =
  | 'CRITICAL'
  | 'AT_RISK'
  | 'WATCH'
  | 'NEEDS_REVIEW'
  | 'HEALTHY'
  | 'TOO_NEW'
  | 'ERROR';

export type Confidence = 'High' | 'Medium' | 'Low' | null;

export type Pattern = 'sudden_cliff' | 'slow_erosion' | null;

export interface Windows {
  onboarding?: [number, number];
  baseline: [number, number];
  recent: [number, number];
}

export interface StarterResult {
  trend_pct: number | null;
  flagged: boolean;
  error: string | null;
}

export interface AccountError {
  code: string;
  message: string;
}

export interface AccountResult {
  account_id: string;
  account_name: string;
  plan_tier: string;
  weeks_of_history: number;
  tier: Tier;
  confidence: Confidence;
  reason_code: string;
  recent_level: number | null;
  baseline_level: number | null;
  drop_pct: number | null;
  last2_drop_pct: number | null;
  noise_pct: number | null;
  flags: string[];
  pattern: Pattern;
  cliff_week: number | null;
  annotations: string[];
  priority_score: number;
  rank: number;
  reason: string;
  recommended_action: string;
  weekly_logins: number[];
  windows: Windows | null;
  starter?: StarterResult;
  error: AccountError | null;
}

export interface HealthResponse {
  status: string;
  llm_available: boolean;
  version: string;
}

export interface DatasetItem {
  id: string;
  name: string;
  accounts: number;
}

export interface ConfigDefinitions {
  recent_level: string;
  baseline_level: string;
  drop: string;
  last2_drop: string;
  noise: string;
  tiers: Record<Tier | string, string>;
}

export interface ConfigResponse {
  thresholds: Record<string, number>;
  definitions: ConfigDefinitions;
  flagged_tiers: Tier[];
}

export interface AnalyzeSummary {
  total_accounts: number;
  flagged: number;
  counts_by_tier: Record<Tier, number>;
}

export interface PlatformAnnotation {
  code: string;
  message: string;
  median_wow_change_pct: number;
  accounts_considered: number;
}

export interface AnalyzeResponse {
  generated_at: string;
  summary: AnalyzeSummary;
  results: AccountResult[];
  annotations: PlatformAnnotation[];
}

export interface ReplayWeek {
  week: number;
  tier: Tier;
  starter_flagged?: boolean | null;
}

export interface ReplayData {
  timeline: ReplayWeek[];
  first_alert_week: number | null;
  first_alert_tier: Tier | null;
  first_week_by_tier: Record<string, number>;
  starter_first_flag_week?: number | null;
}

export interface AccountDetailResponse extends AccountResult {
  replay: ReplayData | null;
}

export interface BacktestItem {
  account_id: string;
  account_name: string;
  timeline: ReplayWeek[];
  first_alert_week: number | null;
  first_alert_tier: Tier | null;
  first_week_by_tier: Record<string, number>;
  starter_first_flag_week?: number | null;
}

export type Verdict = 'agree' | 'we_catch_more' | 'starter_false_alarm' | 'starter_error';

export interface CompareItem {
  account_id: string;
  account_name: string;
  ours: {
    tier: Tier;
    flagged: boolean;
    drop_pct: number | null;
    confidence: Confidence;
  };
  starter: {
    trend_pct: number | null;
    flagged: boolean;
    error: string | null;
  };
  verdict: Verdict;
  note: string;
}

export interface PriorityItem {
  account_id: string;
  account_name: string;
  tier: Tier;
  why: string;
  next_step: string;
  questions: string[];
}

export interface PlatformIncident {
  active: boolean;
  summary: string;
  median_wow_change_pct: number;
  accounts_affected_count: number;
  affected_account_ids: string[];
  recommended_next_step: string;
  questions: string[];
}

export interface AgentBriefingResponse {
  source: 'llm' | 'template';
  validated: boolean;
  cached: boolean;
  model: string | null;
  fallback_reason: string | null;
  headline: string;
  platform_incident?: PlatformIncident | null;
  priorities: PriorityItem[];
  note: string;
}

export interface ApiErrorDetail {
  code: string;
  message: string;
}

export interface ApiErrorPayload {
  error: ApiErrorDetail;
}

export interface AnalyzePayload {
  dataset?: string;
  accounts?: Array<{
    account_id: string;
    account_name: string;
    plan_tier: string;
    weekly_logins: number[];
  }>;
  config_overrides?: Record<string, number>;
}
