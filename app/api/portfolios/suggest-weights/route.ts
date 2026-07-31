import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import Anthropic from '@anthropic-ai/sdk';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface Holding {
  ticker: string;
  name?: string;
  asset_type?: string;
  year_return?: number;
  price?: number;
  value?: number;
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { holdings, target_return, available_cash, lifespan_years } = body as {
    holdings: Holding[];
    target_return: number;
    available_cash: number;
    lifespan_years: number;
  };

  if (!holdings?.length) return NextResponse.json({ error: 'No holdings provided' }, { status: 400 });
  if (typeof target_return !== 'number') return NextResponse.json({ error: 'target_return required' }, { status: 400 });
  if (typeof lifespan_years !== 'number') return NextResponse.json({ error: 'lifespan_years required' }, { status: 400 });

  const holdingsList = holdings.map(h =>
    `- ${h.ticker}${h.name ? ` (${h.name})` : ''}${h.asset_type ? `, type: ${h.asset_type}` : ''}${typeof h.year_return === 'number' ? `, 1yr_return: ${(h.year_return * 100).toFixed(1)}%` : ''}`
  ).join('\n');

  const cashLabel = available_cash > 0 ? `$${available_cash.toLocaleString()}` : 'not specified';

  const prompt = `You are a retirement portfolio advisor. Suggest allocation weights for these holdings based on the investor's profile.

Holdings:
${holdingsList}
Target annual return: ${(target_return * 100).toFixed(1)}%
Total to invest: ${cashLabel}
Investment lifespan: ${lifespan_years} years

Rules:
- Weights must sum to 1.0
- Shorter lifespan (< 5 years): favor low-volatility ETFs and bonds, max 20% in any single growth stock
- Medium lifespan (5-15 years): balanced mix
- Longer lifespan (> 15 years): can accept more growth-oriented, higher-volatility holdings
- Return ONLY a JSON object like: {"TICKER": 0.25, "TICKER2": 0.15, ...} followed by a newline and a 1-2 sentence rationale`;

  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 512,
    messages: [{ role: 'user', content: prompt }],
  });

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : '';

  const jsonStart = raw.indexOf('{');
  const jsonEnd = raw.lastIndexOf('}');
  if (jsonStart === -1 || jsonEnd === -1) {
    return NextResponse.json({ error: 'Claude returned an unexpected response format' }, { status: 502 });
  }

  const jsonStr = raw.slice(jsonStart, jsonEnd + 1);
  const rationale = raw.slice(jsonEnd + 1).trim();

  let parsed: Record<string, number>;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    return NextResponse.json({ error: 'Failed to parse weights from Claude response' }, { status: 502 });
  }

  const total = Object.values(parsed).reduce((sum, w) => sum + w, 0);
  const weights: Record<string, number> = total > 0 && Math.abs(total - 1) > 0.01
    ? Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, Math.round((v / total) * 10000) / 10000]))
    : Object.fromEntries(Object.entries(parsed).map(([k, v]) => [k, Math.round(v * 10000) / 10000]));

  return NextResponse.json({ weights, rationale });
}
