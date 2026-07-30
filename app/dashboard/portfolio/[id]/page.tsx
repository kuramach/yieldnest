import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, TrendingUp } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { BucketWithHoldings } from '@/lib/types';
import PortfolioClient from './PortfolioClient';

type Props = { params: Promise<{ id: string }> };

export default async function PortfolioPage({ params }: Props) {
  const { id } = await params;
  const portfolioId = parseInt(id, 10);
  if (isNaN(portfolioId)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', portfolioId)
    .eq('user_id', user!.id)
    .single();

  if (!portfolio) notFound();

  const { data: buckets } = await supabase
    .from('buckets')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('order_index', { ascending: true });

  const bucketIds = (buckets || []).map((b) => b.id);
  let holdingsMap: Record<number, BucketWithHoldings['holdings']> = {};

  if (bucketIds.length > 0) {
    const { data: holdings } = await supabase
      .from('bucket_holdings')
      .select('*')
      .in('bucket_id', bucketIds)
      .order('added_at', { ascending: true });

    holdingsMap = (holdings || []).reduce((acc, h) => {
      if (!acc[h.bucket_id]) acc[h.bucket_id] = [];
      acc[h.bucket_id].push(h);
      return acc;
    }, {} as Record<number, BucketWithHoldings['holdings']>);
  }

  const bucketsWithHoldings: BucketWithHoldings[] = (buckets || []).map((b) => ({
    ...b,
    holdings: holdingsMap[b.id] || [],
  }));

  // Aggregate stats
  const totalInvested = bucketsWithHoldings.reduce((s, b) => s + b.initial_amount, 0);

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-700 mb-4 transition-colors w-fit"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Dashboard
        </Link>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900">{portfolio.name}</h1>
              {portfolio.linked_360r_scenario_id && (
                <a
                  href={`https://360r.eazybudget.com`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full hover:bg-blue-200 transition-colors"
                >
                  360R #{portfolio.linked_360r_scenario_id}
                  <ExternalLink className="w-3 h-3" />
                </a>
              )}
            </div>
            {portfolio.description && (
              <p className="text-sm text-slate-500 mt-1">{portfolio.description}</p>
            )}
          </div>

          <div className="flex items-start gap-4">
            <Link href={`/dashboard/portfolio/${portfolioId}/monte-carlo`}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold rounded-xl transition-colors">
              <TrendingUp className="w-4 h-4" />
              Monte Carlo
            </Link>
            <div className="text-right">
              <p className="text-2xl font-bold text-slate-900">
                ${totalInvested.toLocaleString()}
              </p>
              <p className="text-xs text-slate-400">total invested</p>
            </div>
          </div>
        </div>
      </div>

      <PortfolioClient
        portfolioId={portfolioId}
        initialBuckets={bucketsWithHoldings}
      />
    </div>
  );
}
