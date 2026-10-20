import React from 'react';
import { Windows } from '../types';

interface SparklineProps {
  data: number[];
  windows: Windows | null;
  width?: number;
  height?: number;
  className?: string;
}

export const Sparkline: React.FC<SparklineProps> = ({
  data,
  windows,
  width = 120,
  height = 32,
  className = '',
}) => {
  if (!data || data.length === 0) {
    return <span className="text-xs text-slate-400">no data</span>;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max === min ? 1 : max - min;
  const paddingY = 4;
  const innerH = height - paddingY * 2;
  const n = data.length;

  const getX = (idx: number) => {
    if (n <= 1) return width / 2;
    return (idx / (n - 1)) * width;
  };

  const getY = (val: number) => {
    return height - paddingY - ((val - min) / range) * innerH;
  };

  const points = data.map((v, i) => `${getX(i).toFixed(1)},${getY(v).toFixed(1)}`).join(' ');

  // Compute shaded window rects
  // Windows: onboarding [i, j], baseline [i, j], recent [i, j] (zero-based inclusive)
  const getWindowRect = (rangeArr?: [number, number]) => {
    if (!rangeArr || rangeArr.length !== 2) return null;
    const [start, end] = rangeArr;
    if (start > end || start >= n) return null;

    const clampedStart = Math.max(0, start);
    const clampedEnd = Math.min(n - 1, end);

    // Give each bar some boundary room
    const step = n > 1 ? width / (n - 1) : width;
    const x1 = Math.max(0, getX(clampedStart) - step * 0.4);
    const x2 = Math.min(width, getX(clampedEnd) + step * 0.4);
    const rectWidth = Math.max(2, x2 - x1);

    return { x: x1, width: rectWidth };
  };

  const onboardingRect = windows?.onboarding ? getWindowRect(windows.onboarding) : null;
  const baselineRect = windows?.baseline ? getWindowRect(windows.baseline) : null;
  const recentRect = windows?.recent ? getWindowRect(windows.recent) : null;

  return (
    <div className={`relative inline-block ${className}`} title={`Weeks 1-${data.length}`}>
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        className="overflow-visible rounded bg-slate-50/70 border border-slate-200/60"
      >
        {/* Onboarding window (grey) */}
        {onboardingRect && (
          <rect
            x={onboardingRect.x}
            y={0}
            width={onboardingRect.width}
            height={height}
            fill="#e2e8f0"
            opacity={0.7}
          >
            <title>Onboarding window</title>
          </rect>
        )}

        {/* Baseline window (blue) */}
        {baselineRect && (
          <rect
            x={baselineRect.x}
            y={0}
            width={baselineRect.width}
            height={height}
            fill="#bfdbfe"
            opacity={0.65}
          >
            <title>Baseline window</title>
          </rect>
        )}

        {/* Recent window (red/orange) */}
        {recentRect && (
          <rect
            x={recentRect.x}
            y={0}
            width={recentRect.width}
            height={height}
            fill="#fecdd3"
            opacity={0.65}
          >
            <title>Recent window (last 4 weeks)</title>
          </rect>
        )}

        {/* Sparkline path */}
        <polyline
          fill="none"
          stroke="#334155"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={points}
        />

        {/* Start dot and End dot */}
        {n > 0 && (
          <circle
            cx={getX(n - 1)}
            cy={getY(data[n - 1])}
            r="2.5"
            className="fill-slate-700"
          />
        )}
      </svg>
    </div>
  );
};
