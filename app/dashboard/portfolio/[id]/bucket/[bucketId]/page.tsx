import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import BucketDetailClient from './BucketDetailClient';
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
    .select('id, name, description, status')
    .eq('id', portfolioId)
    .eq('user_id', user!.id)
    .single();

  // Check collaborator access if not owner
  const { data: collab } = !portfolio
    ? await supabase
        .from('bucket_collaborators')
        .select('role')
        .eq('bucket_id', bucketIdNum)
        .eq('user_id', user!.id)
        .eq('status', 'active')
        .single()
    : { data: null };

  if (!portfolio && !collab) notFound();

  const isOwner = !!portfolio;
  const collaboratorRole = collab?.role as 'editor' | 'viewer' | undefined;

  // For collaborators, fetch bucket without portfolio_id restriction
  const bucketQuery = supabase
    .from('buckets')
    .select('*')
    .eq('id', bucketIdNum);

  if (isOwner) {
    bucketQuery.eq('portfolio_id', portfolioId);
  }

  const { data: bucket } = await bucketQuery.single();
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
    <div className="p-6 max-w-5xl mx-auto">
      {/* Breadcrumb */}
      <Link
        href={isOwner ? `/dashboard/portfolio/${portfolioId}` : '/dashboard'}
        className="flex items-center gap-1.5 text-sm text-slate-400 hover:text-slate-600 mb-5 transition-colors w-fit"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All portfolios
      </Link>

      <BucketDetailClient
        bucketId={bucketIdNum}
        portfolioId={portfolioId}
        portfolioName={portfolio?.name ?? 'Portfolio'}
        portfolioDescription={portfolio?.description ?? undefined}
        portfolioStatus={portfolio?.status ?? 'draft'}
        bucketName={bucket.name}
        holdings={holdingsWithQuotes as (BucketHolding & { quote?: SecurityQuote })[]}
        initialRatingMap={ratingMap}
        actualReturn={actualReturn}
        currentValue={currentValue}
        driftWarning={driftWarning}
        bucketTargetReturn={bucket.target_return}
        bucketLifespanYears={bucket.lifespan_years}
        bucketInitialAmount={bucket.initial_amount}
        isOwner={isOwner}
        collaboratorRole={collaboratorRole}
      />
    </div>
  );
}
