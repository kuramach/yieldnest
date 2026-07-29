import Link from 'next/link';
import { ArrowRight, TrendingUp, Target, BarChart3, Shield, Layers, Zap } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* Nav */}
      <header className="border-b border-slate-100 px-6 h-14 flex items-center justify-between max-w-5xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-emerald-600 rounded-lg flex items-center justify-center">
            <TrendingUp className="w-4 h-4 text-white" />
          </div>
          <span className="font-bold text-slate-900">YieldNest</span>
        </div>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-sm text-slate-500 hover:text-slate-900 transition-colors">
            Sign in
          </Link>
          <Link
            href="/login"
            className="text-sm font-semibold px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
          >
            Get started
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-16 text-center">
        <span className="inline-block text-xs font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full uppercase tracking-widest mb-6">
          Bucket Strategy Portfolio Builder
        </span>
        <h1 className="text-4xl sm:text-5xl font-bold text-slate-900 leading-tight mb-5">
          Build a retirement portfolio<br />
          <span className="text-emerald-600">that hits your exact targets.</span>
        </h1>
        <p className="text-lg text-slate-500 leading-relaxed max-w-xl mx-auto mb-8">
          Define your return targets, get real ETF and stock suggestions, track actual vs target performance — and link it directly to your retirement plan.
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/login"
            className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-colors"
          >
            Start building for free
            <ArrowRight className="w-4 h-4" />
          </Link>
          <a
            href="#how-it-works"
            className="inline-flex items-center gap-2 px-6 py-3 border border-slate-200 hover:border-slate-300 text-slate-700 font-semibold rounded-xl transition-colors"
          >
            See how it works
          </a>
        </div>
      </section>

      {/* Stats strip */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-3 gap-6 border border-slate-100 rounded-2xl p-6 bg-slate-50">
          {[
            { value: '3 steps', label: 'to a suggested portfolio' },
            { value: 'Real ETFs', label: 'via Yahoo Finance data' },
            { value: 'Live tracking', label: 'actual vs target return' },
          ].map(({ value, label }) => (
            <div key={label} className="text-center">
              <p className="text-2xl font-bold text-slate-900">{value}</p>
              <p className="text-sm text-slate-500 mt-1">{label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="max-w-4xl mx-auto px-6 pb-20">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest text-center mb-3">
          How it works
        </p>
        <h2 className="text-2xl font-bold text-slate-900 text-center mb-10">
          Three steps to a portfolio that works
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            {
              step: '01',
              icon: Layers,
              title: 'Define your buckets',
              description:
                'Create retirement buckets — each with a target annual return (e.g. 7%, 11%, 20%) and a lifespan in years. Think of each bucket as a pool of money with a job to do.',
            },
            {
              step: '02',
              icon: Zap,
              title: 'Get portfolio suggestions',
              description:
                'YieldNest fetches live return data for curated ETFs and stocks, then runs a weighted optimizer to suggest 3 portfolio mixes that hit your target. You approve or adjust.',
            },
            {
              step: '03',
              icon: BarChart3,
              title: 'Track & rebalance',
              description:
                'Watch actual return vs target in real time. Get rebalance suggestions when drift exceeds 5%. Optionally link buckets to your 360Retirement scenario.',
            },
          ].map(({ step, icon: Icon, title, description }) => (
            <div key={step} className="relative pl-0">
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-black text-emerald-600 opacity-60 tracking-widest">{step}</span>
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center">
                  <Icon className="w-4 h-4 text-emerald-600" />
                </div>
              </div>
              <h3 className="font-semibold text-slate-800 mb-2">{title}</h3>
              <p className="text-sm text-slate-500 leading-relaxed">{description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="bg-slate-50 border-y border-slate-100 py-16 px-6">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-2xl font-bold text-slate-900 text-center mb-10">
            Everything in one place
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[
              { icon: Target, title: 'Target-return optimizer', desc: 'Greedy algorithm finds the weighted mix of ETFs/stocks closest to your return goal.' },
              { icon: TrendingUp, title: 'Live market data', desc: 'Powered by Yahoo Finance — no API key needed. Real prices, real 52-week returns.' },
              { icon: Shield, title: 'Row-level security', desc: 'Your portfolio data is private. Supabase RLS ensures only you see your data.' },
              { icon: Layers, title: 'Multi-bucket strategy', desc: 'Model the classic conservative/moderate/aggressive bucket strategy in one portfolio.' },
              { icon: BarChart3, title: 'Performance dashboard', desc: 'Actual vs target return per bucket, current value, burn-down timeline.' },
              { icon: Zap, title: '360Retirement link', desc: 'Connect bucket returns to your 360Retirement scenario so projections use real portfolio data.' },
            ].map(({ icon: Icon, title, desc }) => (
              <div key={title} className="flex gap-3 p-4 bg-white border border-slate-100 rounded-xl">
                <div className="w-8 h-8 bg-emerald-100 rounded-lg flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{title}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-2xl mx-auto px-6 py-20 text-center">
        <h2 className="text-2xl font-bold text-slate-900 mb-4">
          Ready to build a portfolio with a purpose?
        </h2>
        <p className="text-slate-500 mb-8">
          Free to use. No credit card. Your data stays yours.
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-8 py-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-lg rounded-xl transition-colors"
        >
          Create your first portfolio
          <ArrowRight className="w-5 h-5" />
        </Link>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-100 px-6 py-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <div className="w-5 h-5 bg-emerald-600 rounded flex items-center justify-center">
              <TrendingUp className="w-3 h-3 text-white" />
            </div>
            <span>YieldNest · Part of the EazyBudget family</span>
          </div>
          <div className="flex items-center gap-5">
            <a href="https://eazybudget.com" className="hover:text-slate-600 transition-colors">EazyBudget</a>
            <a href="https://360r.eazybudget.com" className="hover:text-slate-600 transition-colors">360 Retirement</a>
            <Link href="/login" className="hover:text-slate-600 transition-colors">Sign in</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
