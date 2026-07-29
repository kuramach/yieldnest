'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import SecuritySearch from '@/components/SecuritySearch';
import BuilderModal from '@/components/BuilderModal';
import type { BucketHolding, SecurityQuote, SuggestedPortfolio } from '@/lib/types';

interface Props {
  bucketId: number;
  portfolioId: number;
  holdings: (BucketHolding & { quote?: SecurityQuote })[];
}

export default function BucketDetailClient({ bucketId, portfolioId, holdings }: Props) {
  const router = useRouter();
  const [showBuilder, setShowBuilder] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  async function handleAddSecurity(security: SecurityQuote, weight: number) {
    const res = await fetch('/api/holdings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        bucket_id: bucketId,
        ticker: security.ticker,
        name: security.name,
        asset_type: security.asset_type,
        weight,
        quantity: 0,
        purchase_price: security.price,
      }),
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add holding');
    }

    router.refresh();
  }

  async function handleDelete(holdingId: number) {
    setDeleting(holdingId);
    try {
      await fetch(`/api/holdings/${holdingId}`, { method: 'DELETE' });
      router.refresh();
    } finally {
      setDeleting(null);
    }
  }

  async function handleApplyPortfolio(portfolio: SuggestedPortfolio) {
    await Promise.all(
      portfolio.holdings.map((h) =>
        fetch('/api/holdings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bucket_id: bucketId,
            ticker: h.ticker,
            name: h.name,
            asset_type: h.asset_type,
            weight: h.weight,
            quantity: 0,
            purchase_price: h.price,
          }),
        })
      )
    );
    router.refresh();
  }

  return (
    <div className="space-y-6">
      {/* Actions */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowBuilder(true)}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors"
        >
          Portfolio Builder
        </button>
      </div>

      {/* Security search */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5">
        <SecuritySearch bucketId={bucketId} onAdd={handleAddSecurity} />
      </div>

      {/* Delete holdings */}
      {holdings.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Manage Holdings</h4>
          <div className="space-y-2">
            {holdings.map((h) => (
              <div
                key={h.id}
                className="flex items-center justify-between py-2 px-3 border border-slate-100 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="font-mono font-bold text-sm text-slate-800 bg-slate-100 px-2 py-0.5 rounded">
                    {h.ticker}
                  </span>
                  <span className="text-sm text-slate-500">{(h.weight * 100).toFixed(0)}% weight</span>
                </div>
                <button
                  onClick={() => handleDelete(h.id)}
                  disabled={deleting === h.id}
                  className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Builder modal */}
      {showBuilder && (
        <BuilderModal
          bucketId={bucketId}
          onClose={() => setShowBuilder(false)}
          onApply={handleApplyPortfolio}
        />
      )}
    </div>
  );
}
