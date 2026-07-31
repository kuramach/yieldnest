import { NextRequest, NextResponse } from 'next/server';
import { fetchYahooQuoteSummary } from '@/lib/yahoo-crumb';

// Debug endpoint — remove after confirming ratings work
export async function GET(req: NextRequest) {
  const ticker = req.nextUrl.searchParams.get('ticker') ?? 'VOO';
  try {
    const result = await fetchYahooQuoteSummary(ticker, 'financialData,ratingDetail,defaultKeyStatistics');
    const fd = result?.financialData;
    const rd = result?.ratingDetail?.result;
    const ks = result?.defaultKeyStatistics;
    return NextResponse.json({
      ok: !!result,
      ticker,
      analyst_rating: fd?.recommendationKey ?? null,
      analyst_count: fd?.numberOfAnalystOpinions?.raw ?? null,
      morningstar_overall: rd?.morningStarOverallRating ?? null,
      morningstar_risk: rd?.morningStarRiskRating ?? null,
      ratingDetail_raw: rd ?? null,
      morningStarReturnRating: ks?.morningStarReturnRating ?? null,
      morningStarRiskRating: ks?.morningStarRiskRating ?? null,
      modules_returned: result ? Object.keys(result) : [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
