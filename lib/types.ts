export interface Portfolio {
  id: number;
  user_id: string;
  name: string;
  description?: string;
  linked_360r_scenario_id?: number;
  created_at: string;
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
