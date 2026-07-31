import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import ReturnBar from '@/components/ReturnBar';
import BucketDetailClient from './BucketDetailClient';
import StressTestPanel from './StressTestPanel';
import type { BucketHolding, SecurityQuote, TickerRating } from '@/lib/types';
import { fetchYahooQuoteSummary } from '@/lib/yahoo-crumb';
import { fetchQuotes } from '@/lib/yahoo-quotes';

async function fetchLongTermReturn(ticker: string, range: '10y' | '20y'): Promise<number | undefined> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=${range}`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      next: { revalidate: 86400 },
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json() as any;
    const closes: number[] = (json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? []).filter(Boolean);
    if (closes.length < 12) return undefined;
    const years = closes.length / 12;
    return Math.pow(closes[closes.length - 1] / closes[0], 1 / years) - 1;
  } catch { return undefined; }
}

async function fetchRatings(tickers: string[]): Promise<Record<string, TickerRating>> {
  const results = await Promise.allSettled(tickers.map(async (ticker) => {
    const [r, ret10, ret20] = await Promise.all([
      fetchYahooQuoteSummary(ticker, 'financialData,summaryDetail,defaultKeyStatistics'),
      fetchLongTermReturn(ticker, '10y'),
      fetchLongTermReturn(ticker, '20y'),
    ]);
    if (!r) return { ticker } as TickerRating;
    const fd = r.financialData;
    const sd = r.summaryDetail;
    const ks = r.defaultKeyStatistics;
    return {
      ticker,
      analyst_rating: fd?.recommendationKey ?? undefined,
      analyst_count: fd?.numberOfAnalystOpinions?.raw ?? undefined,
      analyst_mean: fd?.recommendationMean?.raw ?? undefined,
      fund_category: ks?.category ?? undefined,
      fund_family: ks?.fundFamily ?? undefined,
      yield_rate: (ks?.yield?.raw ?? sd?.yield?.raw) ?? undefined,
      three_year_return: ks?.threeYearAverageReturn?.raw ?? undefined,
      five_year_return: ks?.fiveYearAverageReturn?.raw ?? undefined,
      ten_year_return: ret10,
      twenty_year_return: ret20,
    } as TickerRating;
  }));
  const map: Record<string, TickerRating> = {};
  results.forEach((r, i) => { if (r.status === 'fulfilled') map[tickers[i]] = r.value; });
  return map;
}

type Props = { params: Promise<{ id: string; bucketId: string }> };

export default async function BucketDetailPage({ params }: Props) {
  const { id, bucketId } = await params;
  const portfolioId = parseInt(id, 10);
  const bucketIdNum = parseInt(bucketId, 10);
  if (isNaN(portfolioId) || isNaN(bucketIdNum)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Verify ownership
  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('id, name')
    .eq('id', portfolioId)
    .eq('user_id', user!.id)
    .single();
  if (!portfolio) notFound();

  const { data: bucket } = await supabase
    .from('buckets')
    .select('*')
    .eq('id', bucketIdNum)
    .eq('portfolio_id', portfolioId)
    .single();
  if (!bucket) notFound();

  const { data: holdings } = await supabase
    .from('bucket_holdings')
    .select('*')
    .eq('bucket_id', bucketIdNum)
    .order('added_at', { ascending: true });

  // Fetch live quotes and ratings in parallel (directly, no internal API round-trip)
  let quoteMap2: Record<string, { price: number; year_return?: number; name: string }> = {};
  let ratingMap: Record<string, TickerRating> = {};
  if (holdings && holdings.length > 0) {
    const tickers = holdings.map((h: BucketHolding) => h.ticker);
    const [quotesResult, ratingsResult] = await Promise.all([
      fetchQuotes(tickers),
      fetchRatings(tickers),
    ]);
    quoteMap2 = quotesResult;
    ratingMap = ratingsResult;
  }

  const holdingsWithQuotes = (holdings || []).map((h: BucketHolding) => {
    const q = quoteMap2[h.ticker];
    return {
      ...h,
      quote: q ? { ticker: h.ticker, name: q.name, price: q.price, change_pct: 0, year_return: q.year_return, asset_type: h.asset_type } as SecurityQuote : undefined,
    };
  });

  // Compute actual weighted return
  const actualReturn = holdingsWithQuotes.reduce((sum, h) => {
    const yr = h.quote?.year_return ?? 0;
    return sum + h.weight * yr;
  }, 0);

  // Current value estimate
  const currentValue = holdingsWithQuotes.reduce((sum, h) => {
    if (h.quantity > 0 && h.quote?.price) return sum + h.quantity * h.quote.price;
    return sum + h.weight * bucket.initial_amount;
  }, 0);

  // Check for rebalance drift
  const driftWarning = holdingsWithQuotes.some((h) => {
    const holdingValue = h.quantity > 0 && h.quote?.price
      ? h.quantity * h.quote.price
      : h.weight * bucket.initial_amount;
    const currentW = currentValue > 0 ? holdingValue / currentValue : h.weight;
    return Math.abs(currentW - h.weight) > 0.05;
  });

  return (
    <div className="p-8 max-w-4xl">
      {/* Breadcrumb */}
      <Link
        href={`/dashboard/portfolio/${portfolioId}`}
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-700 mb-6 transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to {portfolio.name}
      </Link>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">{bucket.name}</h1>
        <p className="text-sm text-slate-400 mt-0.5">
          Target {(bucket.target_return * 100).toFixed(0)}% annual return ·{' '}
          {bucket.lifespan_years} year lifespan ·{' '}
          {bucket.initial_amount > 0 ? `$${bucket.initial_amount.toLocaleString()} invested` : 'No amount set'}
        </p>
      </div>

      {/* Return bar + stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Return Performance
          </h3>
          <ReturnBar
            targetReturn={bucket.target_return}
            actualReturn={holdingsWithQuotes.length > 0 ? actualReturn : undefined}
          />
          <div className="mt-3 text-xs text-slate-400">
            {holdingsWithQuotes.length === 0
              ? 'Add holdings to see actual return'
              : `Based on ${holdingsWithQuotes.length} holding${holdingsWithQuotes.length > 1 ? 's' : ''} trailing 12-month returns`}
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5">
          <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">
            Portfolio Health
          </h3>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Current value</span>
              <span className="font-semibold text-slate-800">${currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Holdings</span>
              <span className="font-semibold text-slate-800">{holdingsWithQuotes.length}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Weight allocated</span>
              <span className="font-semibold text-slate-800">
                {Math.min(holdingsWithQuotes.reduce((s, h) => s + h.weight, 0) * 100, 100).toFixed(0)}%
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Stress Test */}
      {holdingsWithQuotes.length > 0 && bucket.initial_amount > 0 && (
        <StressTestPanel
          holdings={holdingsWithQuotes.map(h => ({
            weight: h.weight,
            year_return: h.quote?.year_return,
            asset_type: h.asset_type,
          }))}
          lifespan_years={bucket.lifespan_years}
          initial_amount={bucket.initial_amount}
        />
      )}

      {/* Rebalance warning */}
      {driftWarning && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl mb-6">
          <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Rebalance suggested</p>
            <p className="text-xs text-amber-600 mt-0.5">
              One or more holdings have drifted more than 5% from their target weight. Consider rebalancing.
            </p>
          </div>
        </div>
      )}

      {/* Holdings table */}
      {holdingsWithQuotes.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden mb-6">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-700">Holdings</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-slate-400 border-b border-slate-100">
                  <th className="text-left px-5 py-2 font-medium">Ticker</th>
                  <th className="text-left px-4 py-2 font-medium">Name</th>
                  <th className="text-left px-4 py-2 font-medium">Ratings</th>
                  <th className="text-right px-4 py-2 font-medium">Weight</th>
                  <th className="text-right px-4 py-2 font-medium">Price</th>
                  <th className="text-right px-4 py-2 font-medium">1yr Return</th>
                  <th className="text-right px-4 py-2 font-medium">Value</th>
                </tr>
              </thead>
              <tbody>
                {holdingsWithQuotes.map((h) => {
                  const holdingValue =
                    h.quantity > 0 && h.quote?.price
                      ? h.quantity * h.quote.price
                      : h.weight * bucket.initial_amount;
                  const yr = h.quote?.year_return;
                  const rating = ratingMap[h.ticker];
                  const ANALYST_COLORS: Record<string, string> = {
                    strongBuy: 'bg-emerald-100 text-emerald-800',
                    buy: 'bg-green-100 text-green-700',
                    hold: 'bg-amber-100 text-amber-700',
                    sell: 'bg-orange-100 text-orange-700',
                    strongSell: 'bg-rose-100 text-rose-700',
                  };
                  const ANALYST_LABELS: Record<string, string> = {
                    strongBuy: 'Strong Buy', buy: 'Buy', hold: 'Hold', sell: 'Sell', strongSell: 'Strong Sell',
                  };

                  return (
                    <tr key={h.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <span className="font-mono font-bold text-slate-800 bg-slate-100 px-2 py-0.5 rounded text-xs">
                          {h.ticker}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 max-w-[160px] truncate">
                        {h.name || h.quote?.name || h.ticker}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          {rating?.analyst_rating && (
                            <span className={`inline-block text-xs font-semibold px-2 py-0.5 rounded-full w-fit ${ANALYST_COLORS[rating.analyst_rating] ?? 'bg-slate-100 text-slate-600'}`}>
                              {ANALYST_LABELS[rating.analyst_rating] ?? rating.analyst_rating}
                              {rating.analyst_count ? <span className="font-normal ml-1 opacity-70">({rating.analyst_count})</span> : null}
                            </span>
                          )}
                          {rating?.fund_category && (
                            <span className="inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 w-fit">
                              {rating.fund_category}
                            </span>
                          )}
                          {rating?.yield_rate != null && (
                            <span className="text-xs text-slate-500">
                              Yield: <span className="font-semibold text-emerald-700">{(rating.yield_rate * 100).toFixed(2)}%</span>
                            </span>
                          )}
                          {(rating?.three_year_return != null || rating?.five_year_return != null || rating?.ten_year_return != null || rating?.twenty_year_return != null) && (
                            <div className="flex flex-wrap gap-x-2 gap-y-0.5">
                              {rating?.three_year_return != null && (
                                <span className="text-xs text-slate-400">3yr: <span className={`font-semibold ${rating.three_year_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{(rating.three_year_return * 100).toFixed(1)}%</span></span>
                              )}
                              {rating?.five_year_return != null && (
                                <span className="text-xs text-slate-400">5yr: <span className={`font-semibold ${rating.five_year_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{(rating.five_year_return * 100).toFixed(1)}%</span></span>
                              )}
                              {rating?.ten_year_return != null && (
                                <span className="text-xs text-slate-400">10yr: <span className={`font-semibold ${rating.ten_year_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{(rating.ten_year_return * 100).toFixed(1)}%</span></span>
                              )}
                              {rating?.twenty_year_return != null && (
                                <span className="text-xs text-slate-400">20yr: <span className={`font-semibold ${rating.twenty_year_return >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{(rating.twenty_year_return * 100).toFixed(1)}%</span></span>
                              )}
                            </div>
                          )}
                          {!rating?.analyst_rating && !rating?.fund_category && (
                            <span className="text-xs text-slate-300">—</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-700">
                        {(h.weight * 100).toFixed(0)}%
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        {h.quote?.price ? `$${h.quote.price.toFixed(2)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {yr !== undefined ? (
                          <span className={yr >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-500 font-semibold'}>
                            {yr >= 0 ? '+' : ''}{(yr * 100).toFixed(1)}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-slate-600">
                        ${holdingValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-50 text-xs font-semibold text-slate-600">
                  <td className="px-5 py-3" colSpan={3}>Total</td>
                  <td className="px-4 py-3 text-right">
                    {(holdingsWithQuotes.reduce((s, h) => s + h.weight, 0) * 100).toFixed(0)}%
                  </td>
                  <td className="px-4 py-3" />
                  <td className="px-4 py-3 text-right text-emerald-700">
                    {holdingsWithQuotes.length > 0 ? `${(actualReturn * 100).toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    ${currentValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Interactive search + manage section */}
      <BucketDetailClient
        bucketId={bucketIdNum}
        portfolioId={portfolioId}
        holdings={holdingsWithQuotes as (BucketHolding & { quote?: SecurityQuote })[]}
        bucketTargetReturn={bucket.target_return}
        bucketLifespanYears={bucket.lifespan_years}
        bucketInitialAmount={bucket.initial_amount}
      />
    </div>
  );
}
