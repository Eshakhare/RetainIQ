import { Tier } from '../types';

export const TIER_CONFIG: Record<
  Tier,
  {
    displayName: string;
    bg: string;
    text: string;
    border: string;
    badgeBg: string;
    badgeText: string;
    dotBg: string;
    hexColor: string;
  }
> = {
  CRITICAL: {
    displayName: 'Critical',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    badgeBg: 'bg-red-100',
    badgeText: 'text-red-800',
    dotBg: 'bg-red-500',
    hexColor: '#ef4444',
  },
  AT_RISK: {
    displayName: 'At risk',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-800',
    dotBg: 'bg-orange-500',
    hexColor: '#f97316',
  },
  WATCH: {
    displayName: 'Watch',
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    badgeBg: 'bg-amber-100',
    badgeText: 'text-amber-800',
    dotBg: 'bg-amber-500',
    hexColor: '#f59e0b',
  },
  NEEDS_REVIEW: {
    displayName: 'Needs review',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-800',
    dotBg: 'bg-purple-500',
    hexColor: '#a855f7',
  },
  HEALTHY: {
    displayName: 'Healthy',
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    badgeBg: 'bg-emerald-100',
    badgeText: 'text-emerald-800',
    dotBg: 'bg-emerald-500',
    hexColor: '#10b981',
  },
  TOO_NEW: {
    displayName: 'Too new to score',
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    badgeBg: 'bg-slate-200',
    badgeText: 'text-slate-700',
    dotBg: 'bg-slate-400',
    hexColor: '#64748b',
  },
  ERROR: {
    displayName: 'Rejected input',
    bg: 'bg-zinc-100',
    text: 'text-zinc-800',
    border: 'border-zinc-300',
    badgeBg: 'bg-zinc-200',
    badgeText: 'text-zinc-800',
    dotBg: 'bg-zinc-600',
    hexColor: '#3f3f46',
  },
};

export const ALL_TIERS: Tier[] = [
  'CRITICAL',
  'AT_RISK',
  'WATCH',
  'NEEDS_REVIEW',
  'HEALTHY',
  'TOO_NEW',
  'ERROR',
];

export function formatPct(val: number | null | undefined): string {
  if (val === null || val === undefined || isNaN(val)) {
    return 'n/a';
  }
  const pct = Math.round(val * 100);
  if (pct > 0) return `+${pct}%`;
  return `${pct}%`;
}

export function formatNumber(val: number | null | undefined, decimals = 1): string {
  if (val === null || val === undefined || isNaN(val)) {
    return 'n/a';
  }
  return Number.isInteger(val) ? val.toString() : val.toFixed(decimals);
}

export function getTierColor(tier: Tier | string): string {
  if (tier in TIER_CONFIG) {
    return TIER_CONFIG[tier as Tier].hexColor;
  }
  return '#94a3b8';
}
