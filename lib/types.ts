export interface Portfolio {
  id: number;
  user_id: string;
  name: string;
  description?: string;
  linked_360r_scenario_id?: number;
  is_public: boolean;
  imported_from_id?: number;
  created_at: string;
}

export interface ImportedHolding {
  ticker: string;
  shares: number;
  value?: number;
  name?: string;
  description?: string;
  price?: number;
  year_return?: number;
  asset_type?: 'stock' | 'etf' | 'bond';
  morningstar_stars?: number;       // 1–5, available for ETFs/funds
  analyst_rating?: string;          // 'strongBuy'|'buy'|'hold'|'sell'|'strongSell'
  analyst_count?: number;
}

export interface TickerRating {
  ticker: string;
  morningstar_stars?: number;
  morningstar_risk?: number;
  analyst_rating?: string;
  analyst_count?: number;
  analyst_mean?: number;            // 1=Strong Buy … 5=Strong Sell
  fund_category?: string;           // e.g. "Large Blend", "Dividend"
  fund_family?: string;             // e.g. "Vanguard", "Schwab"
  yield_rate?: number;              // distribution yield, e.g. 0.0107
  three_year_return?: number;       // annualized 3yr return
  five_year_return?: number;        // annualized 5yr return
  ten_year_return?: number;         // annualized 10yr return (computed from price history)
  twenty_year_return?: number;      // annualized 20yr return (computed from price history)
}

export interface HoldingHistoricalStats {
  ticker: string;
  cagr: number;
  best_year: number;
  worst_year: number;
  median_year: number;
  volatility: number;
  years_of_data: number;
  annual_returns: { year: number; return: number }[];
}

export interface PortfolioAnalysis {
  stats: HoldingHistoricalStats[];
  ai_narrative: string;
  portfolio_best: number;
  portfolio_worst: number;
  portfolio_median: number;
}

export interface OptimizationResult {
  ticker: string;
  name: string;
  weight: number;
  year_return: number;
  cagr: number;
  asset_type: 'stock' | 'etf' | 'bond';
  price: number;
  dollar_amount: number;
  shares_to_buy: number;
}

export interface PublicPortfolio {
  id: number;
  user_id: string;
  name: string;
  description?: string;
  is_public: boolean;
  created_at: string;
  bucket_count: number;
  holding_count: number;
  avg_return?: number;
}

export interface Bucket {
  id: number;
  portfolio_id: number;
  name: string;
  target_return: number;  // 0.07 = 7%
  lifespan_years: number;
  initial_amount: number;
  order_index: number;
  created_at: string;
}

export interface BucketHolding {
  id: number;
  bucket_id: number;
  ticker: string;
  name?: string;
  asset_type: 'stock' | 'etf' | 'bond';
  weight: number;
  quantity: number;
  purchase_price: number;
  added_at: string;
}

export interface SecurityQuote {
  ticker: string;
  name: string;
  price: number;
  change_pct: number;
  year_return?: number;    // trailing 12-month return
  five_year_return?: number;
  dividend_yield?: number;
  asset_type: 'stock' | 'etf' | 'bond';
  sector?: string;
}

export interface BucketWithHoldings extends Bucket {
  holdings: (BucketHolding & { quote?: SecurityQuote })[];
  actual_return?: number;  // computed from current prices
  current_value?: number;
}

export interface SuggestedPortfolio {
  holdings: {
    ticker: string;
    name: string;
    weight: number;
    year_return: number;
    asset_type: 'stock' | 'etf' | 'bond';
    price: number;
  }[];
  weighted_return: number;
  risk_label: string;
  description: string;
}
