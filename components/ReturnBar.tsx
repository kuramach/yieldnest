'use client';

interface ReturnBarProps {
  targetReturn: number;   // e.g. 0.07
  actualReturn?: number;  // e.g. 0.065
  className?: string;
}

export default function ReturnBar({ targetReturn, actualReturn, className = '' }: ReturnBarProps) {
  const target = targetReturn * 100;
  const actual = (actualReturn ?? 0) * 100;

  // Determine color based on performance vs target
  let barColor = 'bg-slate-300';
  let labelColor = 'text-slate-400';
  if (actualReturn !== undefined) {
    const gap = actualReturn - targetReturn;
    if (gap >= 0) {
      barColor = 'bg-emerald-500';
      labelColor = 'text-emerald-600';
    } else if (gap >= -0.02) {
      barColor = 'bg-amber-400';
      labelColor = 'text-amber-600';
    } else {
      barColor = 'bg-red-500';
      labelColor = 'text-red-600';
    }
  }

  // Scale bars relative to the max of target or actual (min visual width 8%)
  const maxVal = Math.max(target, actual, 1);
  const targetWidth = Math.min((target / maxVal) * 100, 100);
  const actualWidth = actualReturn !== undefined ? Math.min((actual / maxVal) * 100, 100) : 0;

  return (
    <div className={`space-y-1.5 ${className}`}>
      {/* Target bar (ghost) */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 w-14 shrink-0">Target</span>
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-slate-300 rounded-full"
            style={{ width: `${targetWidth}%` }}
          />
        </div>
        <span className="text-xs text-slate-500 w-12 text-right">{target.toFixed(1)}%</span>
      </div>

      {/* Actual bar */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-slate-400 w-14 shrink-0">Actual</span>
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-500 ${
              actualReturn !== undefined ? barColor : 'bg-slate-200'
            }`}
            style={{ width: actualReturn !== undefined ? `${actualWidth}%` : '0%' }}
          />
        </div>
        <span className={`text-xs w-12 text-right font-medium ${labelColor}`}>
          {actualReturn !== undefined ? `${actual.toFixed(1)}%` : '—'}
        </span>
      </div>
    </div>
  );
}
