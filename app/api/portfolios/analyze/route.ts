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

async function fetchHistoricalStats(ticker: string): Promise<HoldingHistoricalStats | null> {
  try {
    const yahooFinance = (await import('yahoo-finance2')).default;
    const period1 = new Date();
    period1.setFullYear(period1.getFullYear() - 20);

    const history = await yahooFinance.historical(ticker, {
      period1,
      interval: '1mo',
    });

    if (!history || history.length < 12) return null;

    // Group by calendar year → calculate annual return
    const byYear: Record<number, { prices: number[] }> = {};
    for (const point of history) {
      const year = new Date(point.date).getFullYear();
      const price = (point as any).adjclose ?? point.close;
      if (!price || price <= 0) continue;
      if (!byYear[year]) byYear[year] = { prices: [] };
      byYear[year].prices.push(price);
    }

    const annualReturns: { year: number; return: number }[] = [];
    const sortedYears = Object.keys(byYear).map(Number).sort();

    for (let i = 1; i < sortedYears.length; i++) {
      const prevYear = sortedYears[i - 1];
      const currYear = sortedYears[i];
      const prevPrices = byYear[prevYear].prices;
      const currPrices = byYear[currYear].prices;
      const startPrice = prevPrices[prevPrices.length - 1];
      const endPrice = currPrices[currPrices.length - 1];
      if (startPrice > 0) {
        annualReturns.push({ year: currYear, return: (endPrice - startPrice) / startPrice });
      }
    }

    if (annualReturns.length < 2) return null;

    const returns = annualReturns.map(r => r.return).sort((a, b) => a - b);
    const best = returns[returns.length - 1];
    const worst = returns[0];
    const med = median(returns);
    const mean = returns.reduce((a, b) => a + b, 0) / returns.length;
    const variance = returns.reduce((s, r) => s + Math.pow(r - mean, 2), 0) / returns.length;
    const volatility = Math.sqrt(variance);

    // CAGR over full period
    const firstPrices = byYear[sortedYears[0]].prices;
    const lastPrices = byYear[sortedYears[sortedYears.length - 1]].prices;
    const startPrice = firstPrices[0];
    const endPrice = lastPrices[lastPrices.length - 1];
    const years = history.length / 12;
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
  const holdingsSummary = stats.map(s => {
    const h = holdings.find(h => h.ticker === s.ticker);
    return `${s.ticker}: CAGR ${(s.cagr * 100).toFixed(1)}%, Best year ${(s.best_year * 100).toFixed(1)}%, Worst year ${(s.worst_year * 100).toFixed(1)}%, Median ${(s.median_year * 100).toFixed(1)}%, Volatility ${(s.volatility * 100).toFixed(1)}%, ${s.years_of_data} years of data${h?.value ? `, Current value $${h.value.toLocaleString()}` : ''}`;
  }).join('\n');

  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: `You are a portfolio analyst. Analyze this portfolio of ${stats.length} holdings based on 20-year historical data.

Holdings performance:
${holdingsSummary}

User's target: ${(targetReturn * 100).toFixed(1)}% annual return
Available to invest: $${availableCash.toLocaleString()}

Write a concise 3-4 paragraph analysis covering:
1. Overall portfolio quality and historical performance assessment
2. Standout performers and underperformers / high-risk holdings
3. Whether the ${(targetReturn * 100).toFixed(1)}% target is realistic given historical data, and what risk that implies
4. One or two specific recommendations for weight allocation strategy given the available cash

Be direct and specific. Use actual numbers from the data. No fluff.`,
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

  if (!holdings?.length) {
    return NextResponse.json({ error: 'No holdings provided' }, { status: 400 });
  }

  const tickers = [...new Set(holdings.map(h => h.ticker))].slice(0, 25);

  // Fetch historical stats in parallel
  const results = await Promise.all(tickers.map(fetchHistoricalStats));
  const stats = results.filter((s): s is HoldingHistoricalStats => s !== null);

  if (stats.length === 0) {
    return NextResponse.json({ error: 'Could not fetch historical data for any holdings' }, { status: 400 });
  }

  // Portfolio-level blended best/worst/median (equal-weight estimate)
  const allBestYears = stats.map(s => s.best_year);
  const allWorstYears = stats.map(s => s.worst_year);
  const allMedians = stats.map(s => s.median_year);
  const portfolioBest = allBestYears.reduce((a, b) => a + b, 0) / allBestYears.length;
  const portfolioWorst = allWorstYears.reduce((a, b) => a + b, 0) / allWorstYears.length;
  const portfolioMedian = allMedians.reduce((a, b) => a + b, 0) / allMedians.length;

  // AI analysis
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
