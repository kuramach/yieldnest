/**
 * Minimal type shims for yahoo-finance2 responses.
 * We cast quoteSummary results to this interface since the module-path imports
 * don't resolve cleanly in Next.js bundler mode.
 */

export interface YFPrice {
  regularMarketPrice?: number;
  regularMarketChangePercent?: number;
  longName?: string;
  shortName?: string;
  quoteType?: string;
  regularMarketDayLow?: number;
}

export interface YFSummaryDetail {
  dividendYield?: number;
  marketCap?: number;
}

export interface YFDefaultKeyStatistics {
  '52WeekChange'?: number;
  SandP52WeekChange?: number;
}

export interface YFAssetProfile {
  sector?: string;
  industry?: string;
  longBusinessSummary?: string;
}

export interface YFQuoteSummary {
  price?: YFPrice;
  summaryDetail?: YFSummaryDetail;
  defaultKeyStatistics?: YFDefaultKeyStatistics;
  assetProfile?: YFAssetProfile;
}

export interface YFSearchResult {
  quotes?: YFSearchQuote[];
  news?: unknown[];
}

export interface YFSearchQuote {
  symbol: string;
  quoteType?: string;
  shortname?: string;
  longname?: string;
}
