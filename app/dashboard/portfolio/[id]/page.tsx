import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import PortfolioHoldingsClient from './PortfolioHoldingsClient';
import PortfolioNameEditor from './PortfolioNameEditor';

type Props = { params: Promise<{ id: string }> };

const BUCKET_LABEL: Record<number, { label: string; color: string }> = {
  1: { label: 'Bucket 1 — Safety',  color: 'bg-blue-100 text-blue-700' },
  2: { label: 'Bucket 2 — Income',  color: 'bg-amber-100 text-amber-700' },
  3: { label: 'Bucket 3 — Growth',  color: 'bg-emerald-100 text-emerald-700' },
};

const ACCOUNT_LABEL: Record<string, { label: string; color: string }> = {
  taxable: { label: 'Taxable',  color: 'bg-sky-100 text-sky-700' },
  pretax:  { label: 'Pre-Tax',  color: 'bg-orange-100 text-orange-700' },
  roth:    { label: 'Roth',     color: 'bg-violet-100 text-violet-700' },
};

export default async function PortfolioPage({ params }: Props) {
  const { id } = await params;
  const portfolioId = parseInt(id, 10);
  if (isNaN(portfolioId)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: portfolio } = await supabase
    .from('portfolios')
    .select('*')
    .eq('id', portfolioId)
    .eq('user_id', user!.id)
    .single();

  if (!portfolio) notFound();

  const { data: holdings } = await supabase
    .from('portfolio_holdings')
    .select('*')
    .eq('portfolio_id', portfolioId)
    .order('added_at', { ascending: true });

  const bucketMeta = portfolio.bucket_group ? BUCKET_LABEL[portfolio.bucket_group] : null;
  const accountMeta = portfolio.account_type ? ACCOUNT_LABEL[portfolio.account_type] : null;

  return (
    <div className="p-8 max-w-4xl">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 text-sm text-slate-400 hover:text-slate-700 mb-6 transition-colors w-fit"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Dashboard
      </Link>

      <div className="flex items-start justify-between mb-6">
        <div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <PortfolioNameEditor portfolioId={portfolioId} initialName={portfolio.name} />
            {bucketMeta && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${bucketMeta.color}`}>
                {bucketMeta.label}
              </span>
            )}
            {accountMeta && (
              <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${accountMeta.color}`}>
                {accountMeta.label}
              </span>
            )}
            {portfolio.linked_360r_scenario_id && (
              <span className="text-xs font-semibold bg-blue-100 text-blue-700 px-2.5 py-1 rounded-full">
                360R #{portfolio.linked_360r_scenario_id}
              </span>
            )}
          </div>
          {portfolio.description && (
            <p className="text-sm text-slate-500">{portfolio.description}</p>
          )}
        </div>
      </div>

      <PortfolioHoldingsClient
        portfolioId={portfolioId}
        initialHoldings={holdings || []}
        initialStatus={portfolio.status ?? 'draft'}
        bucketGroup={portfolio.bucket_group ?? null}
        accountType={portfolio.account_type ?? null}
        linked360rScenarioId={portfolio.linked_360r_scenario_id ?? null}
      />
    </div>
  );
}
