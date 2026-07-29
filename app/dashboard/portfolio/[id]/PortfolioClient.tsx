'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Plus, Loader2 } from 'lucide-react';
import BucketCard from '@/components/BucketCard';
import BuilderModal from '@/components/BuilderModal';
import type { BucketWithHoldings, SuggestedPortfolio } from '@/lib/types';

interface Props {
  portfolioId: number;
  initialBuckets: BucketWithHoldings[];
}

export default function PortfolioClient({ portfolioId, initialBuckets }: Props) {
  const router = useRouter();
  const [buckets, setBuckets] = useState<BucketWithHoldings[]>(initialBuckets);
  const [showAddBucket, setShowAddBucket] = useState(false);
  const [builderBucketId, setBuilderBucketId] = useState<number | null>(null);
  const [addBucketLoading, setAddBucketLoading] = useState(false);
  const [addBucketError, setAddBucketError] = useState('');

  // New bucket form state
  const [bucketName, setBucketName] = useState('');
  const [targetReturn, setTargetReturn] = useState(7);
  const [lifespan, setLifespan] = useState(10);
  const [initialAmount, setInitialAmount] = useState(0);

  async function handleAddBucket(e: React.FormEvent) {
    e.preventDefault();
    setAddBucketLoading(true);
    setAddBucketError('');

    try {
      const res = await fetch('/api/buckets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolio_id: portfolioId,
          name: bucketName || `Bucket ${buckets.length + 1}`,
          target_return: targetReturn / 100,
          lifespan_years: lifespan,
          initial_amount: initialAmount,
          order_index: buckets.length,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        setAddBucketError(err.error || 'Failed to create bucket');
        return;
      }

      const newBucket = await res.json();
      setBuckets([...buckets, { ...newBucket, holdings: [] }]);
      setShowAddBucket(false);
      setBucketName('');
      setTargetReturn(7);
      setLifespan(10);
      setInitialAmount(0);
    } finally {
      setAddBucketLoading(false);
    }
  }

  async function handleApplyPortfolio(portfolio: SuggestedPortfolio) {
    if (!builderBucketId) return;

    // Add each holding
    await Promise.all(
      portfolio.holdings.map((h) =>
        fetch('/api/holdings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            bucket_id: builderBucketId,
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

  const activeBucket = builderBucketId
    ? buckets.find((b) => b.id === builderBucketId)
    : null;

  return (
    <>
      {/* Buckets section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">
            Buckets ({buckets.length})
          </h2>
          <button
            onClick={() => setShowAddBucket(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-semibold text-emerald-700 border border-emerald-200 hover:bg-emerald-50 rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Bucket
          </button>
        </div>

        {buckets.length === 0 ? (
          <div className="text-center py-14 border-2 border-dashed border-slate-200 rounded-2xl">
            <p className="text-slate-500 font-medium mb-2">No buckets yet</p>
            <p className="text-sm text-slate-400 mb-5">
              Add your first bucket with a return target and lifespan.
            </p>
            <button
              onClick={() => setShowAddBucket(true)}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add First Bucket
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {buckets.map((bucket) => (
              <BucketCard
                key={bucket.id}
                bucket={bucket}
                onBuildPortfolio={() => setBuilderBucketId(bucket.id)}
                onViewDetail={() =>
                  (window.location.href = `/dashboard/portfolio/${portfolioId}/bucket/${bucket.id}`)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Add Bucket modal */}
      {showAddBucket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <h3 className="font-bold text-slate-900 mb-4">Add Bucket</h3>

            {addBucketError && (
              <div className="mb-4 px-3 py-2 bg-red-50 border border-red-100 rounded-lg text-sm text-red-600">
                {addBucketError}
              </div>
            )}

            <form onSubmit={handleAddBucket} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Bucket Name</label>
                <input
                  type="text"
                  value={bucketName}
                  onChange={(e) => setBucketName(e.target.value)}
                  placeholder="e.g. Conservative, Growth, Aggressive..."
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Target Return %</label>
                  <input
                    type="number"
                    value={targetReturn}
                    onChange={(e) => setTargetReturn(parseFloat(e.target.value) || 0)}
                    min={0.1}
                    max={50}
                    step={0.5}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-slate-600 mb-1 block">Lifespan (years)</label>
                  <input
                    type="number"
                    value={lifespan}
                    onChange={(e) => setLifespan(parseInt(e.target.value) || 10)}
                    min={1}
                    max={40}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">Initial Amount ($)</label>
                <input
                  type="number"
                  value={initialAmount}
                  onChange={(e) => setInitialAmount(parseInt(e.target.value) || 0)}
                  step={1000}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>

              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => { setShowAddBucket(false); setAddBucketError(''); }}
                  className="px-4 py-2 border border-slate-200 text-slate-600 text-sm font-medium rounded-xl hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addBucketLoading}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
                >
                  {addBucketLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                  Create Bucket
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Builder modal */}
      {builderBucketId && (
        <BuilderModal
          bucketId={builderBucketId}
          defaultTargetReturn={activeBucket?.target_return}
          defaultAmount={activeBucket?.initial_amount}
          defaultLifespan={activeBucket?.lifespan_years}
          onClose={() => setBuilderBucketId(null)}
          onApply={handleApplyPortfolio}
        />
      )}

      {/* Quick link to bucket detail */}
      {buckets.length > 0 && (
        <div className="mt-6 pt-6 border-t border-slate-100">
          <p className="text-xs text-slate-400 mb-3">Jump to bucket detail</p>
          <div className="flex flex-wrap gap-2">
            {buckets.map((b) => (
              <Link
                key={b.id}
                href={`/dashboard/portfolio/${portfolioId}/bucket/${b.id}`}
                className="text-xs px-3 py-1.5 border border-slate-200 rounded-full text-slate-600 hover:border-emerald-300 hover:text-emerald-700 transition-colors"
              >
                {b.name} · {(b.target_return * 100).toFixed(0)}%
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
