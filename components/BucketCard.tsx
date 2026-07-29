'use client';

import { TrendingUp, Clock, DollarSign, AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import ReturnBar from './ReturnBar';
import type { BucketWithHoldings } from '@/lib/types';

interface BucketCardProps {
  bucket: BucketWithHoldings;
  onBuildPortfolio?: () => void;
  onViewDetail?: () => void;
}

function getStatus(targetReturn: number, actualReturn?: number): {
  label: string;
  color: string;
  icon: React.ReactNode;
} {
  if (actualReturn === undefined || actualReturn === 0) {
    return {
      label: 'No Holdings',
      color: 'text-slate-400 bg-slate-50 border-slate-200',
      icon: <Clock className="w-3 h-3" />,
    };
  }
  const gap = actualReturn - targetReturn;
  if (gap >= 0) {
    return {
      label: 'On Track',
      color: 'text-emerald-700 bg-emerald-50 border-emerald-200',
      icon: <CheckCircle className="w-3 h-3" />,
    };
  } else if (gap >= -0.02) {
    return {
      label: 'Near Target',
      color: 'text-amber-700 bg-amber-50 border-amber-200',
      icon: <AlertTriangle className="w-3 h-3" />,
    };
  } else {
    return {
      label: 'Below Target',
      color: 'text-red-700 bg-red-50 border-red-200',
      icon: <XCircle className="w-3 h-3" />,
    };
  }
}

export default function BucketCard({ bucket, onBuildPortfolio, onViewDetail }: BucketCardProps) {
  const { label, color, icon } = getStatus(bucket.target_return, bucket.actual_return);

  // Years elapsed since bucket creation (approximate)
  const createdDate = new Date(bucket.created_at);
  const now = new Date();
  const yearsElapsed = Math.max(
    0,
    (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24 * 365)
  );
  const burndownPct = Math.min((yearsElapsed / bucket.lifespan_years) * 100, 100);

  const currentValue = bucket.current_value ?? bucket.initial_amount;
  const hasHoldings = bucket.holdings.length > 0;

  return (
    <div className="border border-slate-200 rounded-2xl p-6 hover:border-emerald-200 hover:shadow-md transition-all group bg-white">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="font-semibold text-slate-900">{bucket.name}</h3>
          <p className="text-xs text-slate-400 mt-0.5">
            {bucket.lifespan_years}yr · {bucket.initial_amount > 0 ? `$${bucket.initial_amount.toLocaleString()}` : 'No amount set'}
          </p>
        </div>
        <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-full border ${color}`}>
          {icon}
          {label}
        </span>
      </div>

      {/* Return bar */}
      <ReturnBar
        targetReturn={bucket.target_return}
        actualReturn={bucket.actual_return}
        className="mb-4"
      />

      {/* Burn-down progress */}
      <div className="mb-4">
        <div className="flex justify-between items-center mb-1">
          <span className="text-xs text-slate-400">Time elapsed</span>
          <span className="text-xs text-slate-500">
            {yearsElapsed.toFixed(1)}y / {bucket.lifespan_years}y
          </span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-slate-300 rounded-full transition-all"
            style={{ width: `${burndownPct}%` }}
          />
        </div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-4 mb-4 text-xs text-slate-500">
        <div className="flex items-center gap-1">
          <TrendingUp className="w-3 h-3 text-emerald-500" />
          Target: {(bucket.target_return * 100).toFixed(0)}%
        </div>
        <div className="flex items-center gap-1">
          <DollarSign className="w-3 h-3 text-slate-400" />
          Value: ${currentValue.toLocaleString()}
        </div>
      </div>

      {/* Holdings mini list */}
      {hasHoldings && (
        <div className="mb-4 space-y-1">
          {bucket.holdings.slice(0, 3).map((h) => (
            <div key={h.id} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">
                  {h.ticker}
                </span>
                <span className="text-slate-400 truncate max-w-[120px]">{h.name || h.ticker}</span>
              </div>
              <span className="text-slate-500">{(h.weight * 100).toFixed(0)}%</span>
            </div>
          ))}
          {bucket.holdings.length > 3 && (
            <p className="text-xs text-slate-400">+{bucket.holdings.length - 3} more holdings</p>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        {!hasHoldings ? (
          <button
            onClick={onBuildPortfolio}
            className="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Build Portfolio
          </button>
        ) : (
          <>
            <button
              onClick={onViewDetail}
              className="flex-1 px-3 py-2 border border-slate-200 hover:border-emerald-300 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
            >
              View Holdings
            </button>
            <button
              onClick={onBuildPortfolio}
              className="px-3 py-2 border border-emerald-200 hover:bg-emerald-50 text-emerald-700 text-xs font-semibold rounded-lg transition-colors"
            >
              Rebuild
            </button>
          </>
        )}
      </div>
    </div>
  );
}
