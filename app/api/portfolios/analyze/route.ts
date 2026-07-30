import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';
import type { ImportedHolding, HoldingHistoricalStats, PortfolioAnalysis } from '@/lib/types';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function median(sorted: number[]): number {
  if (sorted.length === 0) return 0;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Fetch monthly historical prices directly from Yahoo Finance chart API (no library needed)
async function fetchHistoricalStats(ticker: string): Promise<HoldingHistoricalStats | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1mo&range=20y`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      next: { revalidate: 86400 },
    });

    if (!res.ok) return null;
    const json = await res.json() as any;
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const timestamps: number[] = result.timestamp ?? [];
    const closes: (number | null)[] = result.indicators?.adjclose?.[0]?.adjclose
      ?? result.indicators?.quote?.[0]?.close
      ?? [];

    if (timestamps.length < 12 || closes.length < 12) return null;

    // Group prices by calendar year
    const byYear: Record<number, number[]> = {};
    for (let i = 0; i < timestamps.length; i++) {
      const price = closes[i];
      if (!price || price <= 0) continue;
      const year = new Date(timestamps[i] * 1000).getFullYear();
      if (!byYear[year]) byYear[year] = [];
      byYear[year].push(price);
    }

    const sortedYears = Object.keys(byYear).map(Number).sort();
    if (sortedYears.length < 3) return null;

    // Annual return = last price of year / last price of previous year - 1
    const annualReturns: { year: number; return: number }[] = [];
    for (let i = 1; i < sortedYears.length; i++) {
      const prev = byYear[sortedYears[i - 1]];
      const curr = byYear[sortedYears[i]];
      const startPrice = prev[prev.length - 1];
      const endPrice = curr[curr.length - 1];
      if (startPrice > 0) {
        annualReturns.push({ year: sortedYears[i], return: (endPrice - startPrice) / startPrice });
      }
    }

    if (annualReturns.length < 2) return null;

    const sorted = annualReturns.map(r => r.return).sort((a, b) => a - b);
    const best = sorted[sorted.length - 1];
    const worst = sorted[0];
    const med = median(sorted);
    const mean = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const variance = sorted.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / sorted.length;
    const volatility = Math.sqrt(variance);

    // CAGR: first price to last price over full period
    const allPrices = closes.filter((p): p is number => !!p && p > 0);
    const startPrice = allPrices[0];
    const endPrice = allPrices[allPrices.length - 1];
    const years = timestamps.length / 12;
    const cagr = startPrice > 0 ? Math.pow(endPrice / startPrice, 1 / years) - 1 : 0;

    return {
      ticker,
      cagr: Math.round(cagr * 10000) / 10000,
      best_year: Math.round(best * 10000) / 10000,
      worst_year: Math.round(worst * 10000) / 10000,
      median_year: Math.round(med * 10000) / 10000,
      volatility: Math.round(volatility * 10000) / 10000,
      years_of_data: Math.round(years),
      annual_returns: annualReturns,
    };
  } catch {
    return null;
  }
}

async function generateAIAnalysis(
  stats: HoldingHistoricalStats[],
  holdings: ImportedHolding[],
  targetReturn: number,
  availableCash: number,
): Promise<string> {
  const summary = stats.map(s => {
    const h = holdings.find(h => h.ticker === s.ticker);
    return `${s.ticker}: CAGR ${(s.cagr * 100).toFixed(1)}%, Best year ${(s.best_year * 100).toFixed(1)}%, Worst year ${(s.worst_year * 100).toFixed(1)}%, Median ${(s.median_year * 100).toFixed(1)}%, Volatility ${(s.volatility * 100).toFixed(1)}%, ${s.years_of_data} yrs data${h?.value ? `, value $${h.value.toLocaleString()}` : ''}`;
  }).join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are a portfolio analyst. Analyze this portfolio of ${stats.length} holdings based on historical data.

Holdings:
${summary}

Target: ${(targetReturn * 100).toFixed(1)}% annual return
Cash to invest: $${availableCash.toLocaleString()}

Write a concise 3-4 paragraph analysis:
1. Overall portfolio quality and historical performance
2. Standout performers and high-risk holdings
3. Whether the ${(targetReturn * 100).toFixed(1)}% target is realistic and what risk it implies
4. Weight allocation strategy recommendations given the available cash

Be direct, use specific numbers, no fluff.`,
    }],
  });

  return message.content[0].type === 'text' ? message.content[0].text : '';
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { holdings, target_return = 0.07, available_cash = 0 } = body as {
    holdings: ImportedHolding[];
    target_return?: number;
    available_cash?: number;
  };

  if (!holdings?.length) return NextResponse.json({ error: 'No holdings provided' }, { status: 400 });

  const tickers = [...new Set(holdings.map(h => h.ticker))].slice(0, 25);

  const results = await Promise.all(tickers.map(fetchHistoricalStats));
  const stats = results.filter((s): s is HoldingHistoricalStats => s !== null);

  if (stats.length === 0) {
    return NextResponse.json({ error: 'Could not fetch historical data. Yahoo Finance may be temporarily unavailable — please try again.' }, { status: 400 });
  }

  const portfolioBest = stats.reduce((s, h) => s + h.best_year, 0) / stats.length;
  const portfolioWorst = stats.reduce((s, h) => s + h.worst_year, 0) / stats.length;
  const portfolioMedian = stats.reduce((s, h) => s + h.median_year, 0) / stats.length;

  let aiNarrative = '';
  try {
    aiNarrative = await generateAIAnalysis(stats, holdings, target_return, available_cash);
  } catch (err) {
    console.error('Claude analysis error:', err);
    aiNarrative = 'AI analysis unavailable.';
  }

  const analysis: PortfolioAnalysis = {
    stats,
    ai_narrative: aiNarrative,
    portfolio_best: Math.round(portfolioBest * 10000) / 10000,
    portfolio_worst: Math.round(portfolioWorst * 10000) / 10000,
    portfolio_median: Math.round(portfolioMedian * 10000) / 10000,
  };

  return NextResponse.json(analysis);
}
