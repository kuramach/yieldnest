import Link from 'next/link';
import { Plus, TrendingUp, DollarSign, Target, Layers, Upload, Globe } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import type { Portfolio, Bucket } from '@/lib/types';

interface PortfolioWithBuckets extends Portfolio {
  buckets: Bucket[];
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: portfolios } = await supabase
    .from('portfolios')
    .select('*')
    .eq('user_id', user!.id)
    .order('created_at', { ascending: false });

  // Fetch buckets for all portfolios
  let allBuckets: Bucket[] = [];
  if (portfolios && portfolios.length > 0) {
    const pIds = portfolios.map((p) => p.id);
    const { data: buckets } = await supabase
      .from('buckets')
      .select('*')
      .in('portfolio_id', pIds);
    allBuckets = buckets || [];
  }

  const portfoliosWithBuckets: PortfolioWithBuckets[] = (portfolios || []).map((p) => ({
    ...p,
    buckets: allBuckets.filter((b) => b.portfolio_id === p.id),
  }));

  // Aggregate stats
  const totalInvested = allBuckets.reduce((sum, b) => sum + b.initial_amount, 0);
  const avgTargetReturn =
    allBuckets.length > 0
      ? allBuckets.reduce((sum, b) => sum + b.target_return, 0) / allBuckets.length
      : 0;

  return (
    <div className="p-8 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Welcome back{user?.email ? `, ${user.email.split('@')[0]}` : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/explore"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-violet-300 hover:bg-violet-50 text-slate-700 hover:text-violet-700 text-sm font-semibold rounded-xl transition-colors"
          >
            <Globe className="w-4 h-4" />
            Explore
          </Link>
          <Link
            href="/dashboard/import"
            className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-emerald-300 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 text-sm font-semibold rounded-xl transition-colors"
          >
            <Upload className="w-4 h-4" />
            Import
          </Link>
          <Link
            href="/dashboard/portfolio/new"
            className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Portfolio
          </Link>
        </div>
      </div>

      {/* Stats */}
      {allBuckets.length > 0 && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          {[
            {
              icon: DollarSign,
              label: 'Total Invested',
              value: `$${totalInvested.toLocaleString()}`,
              color: 'text-emerald-600',
              bg: 'bg-emerald-50',
            },
            {
              icon: Target,
              label: 'Avg Target Return',
              value: `${(avgTargetReturn * 100).toFixed(1)}%`,
              color: 'text-blue-600',
              bg: 'bg-blue-50',
            },
            {
              icon: Layers,
              label: 'Total Buckets',
              value: allBuckets.length.toString(),
              color: 'text-violet-600',
              bg: 'bg-violet-50',
            },
          ].map(({ icon: Icon, label, value, color, bg }) => (
            <div key={label} className="bg-white border border-slate-100 rounded-2xl p-5">
              <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-xs text-slate-400 mt-0.5">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Portfolio list or empty state */}
      {portfoliosWithBuckets.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-slate-200 rounded-2xl">
          <div className="w-14 h-14 bg-emerald-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <TrendingUp className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-slate-800 mb-2">Create your first portfolio</h2>
          <p className="text-sm text-slate-500 max-w-sm mx-auto mb-6">
            A portfolio holds your retirement buckets — each targeting a specific annual return over a defined horizon.
          </p>
          <Link
            href="/dashboard/portfolio/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4" />
            Create Portfolio
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Your Portfolios</h2>
          {portfoliosWithBuckets.map((portfolio) => {
            const avgReturn =
              portfolio.buckets.length > 0
                ? portfolio.buckets.reduce((s, b) => s + b.target_return, 0) / portfolio.buckets.length
                : 0;
            const totalAmount = portfolio.buckets.reduce((s, b) => s + b.initial_amount, 0);

            return (
              <Link
                key={portfolio.id}
                href={`/dashboard/portfolio/${portfolio.id}`}
                className="block border border-slate-200 rounded-2xl p-6 bg-white hover:border-emerald-200 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <h3 className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors">
                        {portfolio.name}
                      </h3>
                      {portfolio.status === 'deployed' ? (
                        <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                          Deployed
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">
                          Draft
                        </span>
                      )}
                      {portfolio.linked_360r_scenario_id && (
                        <span className="text-[10px] font-semibold bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                          360R linked
                        </span>
                      )}
                      {portfolio.is_public && (
                        <span className="text-[10px] font-semibold bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full">
                          Public
                        </span>
                      )}
                      {portfolio.imported_from_id && (
                        <span className="text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                          Imported
                        </span>
                      )}
                    </div>
                    {portfolio.description && (
                      <p className="text-sm text-slate-400 mb-3">{portfolio.description}</p>
                    )}
                    <div className="flex items-center gap-5 text-sm text-slate-500">
                      <span className="flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-slate-400" />
                        {portfolio.buckets.length} {portfolio.buckets.length === 1 ? 'bucket' : 'buckets'}
                      </span>
                      {totalAmount > 0 && (
                        <span className="flex items-center gap-1">
                          <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                          ${totalAmount.toLocaleString()} invested
                        </span>
                      )}
                      {avgReturn > 0 && (
                        <span className="flex items-center gap-1">
                          <Target className="w-3.5 h-3.5 text-slate-400" />
                          {(avgReturn * 100).toFixed(1)}% avg target
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Bucket return chips */}
                  {portfolio.buckets.length > 0 && (
                    <div className="flex gap-1.5 ml-4 shrink-0">
                      {portfolio.buckets.slice(0, 3).map((b) => (
                        <span
                          key={b.id}
                          className="text-xs font-semibold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg"
                        >
                          {(b.target_return * 100).toFixed(0)}%
                        </span>
                      ))}
                      {portfolio.buckets.length > 3 && (
                        <span className="text-xs text-slate-400 px-2 py-1">
                          +{portfolio.buckets.length - 3}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
