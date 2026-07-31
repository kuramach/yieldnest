import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooQuoteSummary } from '@/lib/yahoo-crumb';

// Debug endpoint — remove after confirming ratings work
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker') ?? 'VOO';
  try {
    const result = await fetchYahooQuoteSummary(ticker, 'financialData,summaryDetail,assetProfile,defaultKeyStatistics');
    const fd = result?.financialData;
    const sd = result?.summaryDetail;
    const ap = result?.assetProfile;
    const ks = result?.defaultKeyStatistics;
    return NextResponse.json({
      ok: !!result,
      ticker,
      analyst_rating: fd?.recommendationKey ?? null,
      analyst_count: fd?.numberOfAnalystOpinions?.raw ?? null,
      expense_ratio: sd?.annualHoldingsTurnover?.raw ?? sd?.expenseRatio ?? ap?.netExpenseRatio?.raw ?? null,
      fund_category: ap?.category ?? null,
      fund_family: ap?.fundFamily ?? null,
      beta: ks?.beta?.raw ?? sd?.beta?.raw ?? null,
      dividend_yield: sd?.dividendYield?.raw ?? null,
      modules_returned: result ? Object.keys(result) : [],
      summaryDetail_values: sd ?? null,
      assetProfile_values: ap ?? null,
      defaultKeyStatistics_values: ks ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
