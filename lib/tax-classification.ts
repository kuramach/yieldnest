export type TaxTreatment = 'standard' | '1256' | 'collectible' | 'ric';

// Section 1256 contracts: futures-based ETFs/ETPs structured as partnerships.
// These mark-to-market on Dec 31 and receive 60% LTCG / 40% STCG treatment.
const SECTION_1256_TICKERS = new Set([
  // Energy futures
  'USO', 'UNG', 'UCO', 'SCO', 'BOIL', 'KOLD', 'UGA', 'OILK',
  // Broad commodity (partnership-structured)
  'DBC', 'PDBC', 'GSG', 'DJP', 'RJI', 'USCI',
  // Grain/Ag futures
  'CORN', 'WEAT', 'SOYB', 'JO', 'SGG', 'BAL', 'NIB',
  // Metals futures (partnership-structured — NOT grantor trusts)
  'PALL', 'PPLT',
  // VIX / volatility (futures-based)
  'VXX', 'UVXY', 'SVXY', 'VIXY',
  // Natural resources / diversified futures
  'PDBC', 'BCI', 'FTGC',
]);

// Collectibles: grantor trusts holding physical precious metals.
// Taxed as collectibles at max 28% rate — NOT 1256.
const COLLECTIBLE_TICKERS = new Set([
  'GLD', 'IAU', 'GLDM', 'SGOL', 'BAR',   // Gold grantor trusts
  'SLV', 'SIVR',                            // Silver grantor trusts
  'PLTM',                                   // Platinum grantor trust
]);

// RIC ETFs with known significant return-of-capital distributions.
// These are standard RICs but flagged so ROC tracking is prompted.
const ROC_PRONE_TICKERS = new Set([
  'JEPI', 'JEPQ', 'DIVO', 'QYLD', 'RYLD', 'XYLD',   // Covered call / option income
  'PDI', 'PTY', 'RQI', 'UTF', 'USA',                   // CEFs with high ROC
  'HTGC', 'ARCC', 'MAIN', 'GAIN',                      // BDCs
  'NLY', 'AGNC', 'STWD',                               // Mortgage REITs
]);

export function classifyTicker(ticker: string): TaxTreatment {
  const t = ticker.toUpperCase().trim();
  if (SECTION_1256_TICKERS.has(t)) return '1256';
  if (COLLECTIBLE_TICKERS.has(t))  return 'collectible';
  if (ROC_PRONE_TICKERS.has(t))    return 'ric';
  return 'standard';
}

export const TAX_TREATMENT_META: Record<TaxTreatment, {
  label: string;
  description: string;
  badge: string;
  tip: string;
}> = {
  standard: {
    label: 'Standard',
    description: 'Regular long/short-term capital gains based on holding period.',
    badge: 'bg-slate-100 text-slate-500',
    tip: 'LTCG (>1 yr) or STCG (≤1 yr). No special year-end treatment.',
  },
  '1256': {
    label: 'Sec. 1256',
    description: 'Futures-based ETF. Marked-to-market Dec 31. 60% LTCG / 40% STCG split always applies.',
    badge: 'bg-violet-100 text-violet-700',
    tip: 'IRC §1256: unrealized gains/losses recognized on Dec 31 each year. 60/40 blended rate applies regardless of holding period.',
  },
  collectible: {
    label: 'Collectible',
    description: 'Physical precious metal grantor trust. Max 28% capital gains rate.',
    badge: 'bg-amber-100 text-amber-700',
    tip: 'IRS treats physical metal ETFs (GLD, SLV, etc.) as collectibles — max 28% rate, not the standard 20% LTCG rate.',
  },
  ric: {
    label: 'RIC / ROC',
    description: 'Regulated investment company with likely return-of-capital distributions.',
    badge: 'bg-blue-100 text-blue-700',
    tip: 'Track distributions carefully. ROC (Box 3 on 1099-DIV) reduces your cost basis, not taxed as income. §852(b)(6) spillback may apply to Oct–Dec dividends paid in January.',
  },
};

// ── 1256 MTM calculation ──────────────────────────────────────────────────────

export interface Mtm1256Result {
  ticker: string;
  cost_basis: number;
  year_end_value: number;
  mtm_gain_loss: number;
  ltcg_portion: number;   // 60%
  stcg_portion: number;   // 40%
}

export function compute1256Mtm(
  ticker: string,
  cost_basis: number,
  year_end_value: number,
): Mtm1256Result {
  const mtm_gain_loss = year_end_value - cost_basis;
  return {
    ticker,
    cost_basis,
    year_end_value,
    mtm_gain_loss,
    ltcg_portion: mtm_gain_loss * 0.6,
    stcg_portion: mtm_gain_loss * 0.4,
  };
}

// ── 852(b)(6) spillback detection ─────────────────────────────────────────────

// Returns true if a distribution declared in Oct/Nov/Dec is paid in January —
// in which case it's taxed as if received on Dec 31 of the prior year.
export function isSpillbackDividend(exDate: Date, payDate: Date): boolean {
  const exMonth = exDate.getMonth() + 1; // 1-based
  const payMonth = payDate.getMonth() + 1;
  const payYear = payDate.getFullYear();
  const exYear = exDate.getFullYear();
  return (
    exMonth >= 10 &&
    payMonth === 1 &&
    payYear === exYear + 1
  );
}

// ── ROC cost basis adjustment ─────────────────────────────────────────────────

export function adjustCostBasisForRoc(
  currentCostBasis: number,
  rocPerShare: number,
  shares: number,
): { newCostBasis: number; totalRoc: number } {
  const totalRoc = rocPerShare * shares;
  return {
    newCostBasis: Math.max(0, currentCostBasis - totalRoc),
    totalRoc,
  };
}
