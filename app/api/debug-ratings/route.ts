import { NextResponse } from 'next/server';
import { fetchYahooQuoteSummary } from '@/lib/yahoo-crumb';

// Unauthenticated debug endpoint — remove after confirming ratings work
export async function GET() {
  try {
    const result = await fetchYahooQuoteSummary('AAPL', 'financialData');
    const fd = result?.financialData;
    return NextResponse.json({
      ok: !!result,
      analyst_rating: fd?.recommendationKey ?? null,
      analyst_count: fd?.numberOfAnalystOpinions?.raw ?? null,
      raw_keys: result ? Object.keys(result) : [],
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message });
  }
}
