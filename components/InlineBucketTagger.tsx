'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import type { BucketGroup, AccountType } from '@/lib/types';

const BUCKET_OPTS: { value: BucketGroup; label: string; sub: string; active: string; inactive: string }[] = [
  { value: 1, label: 'Bucket 1', sub: 'Safety',  active: 'bg-blue-600 text-white border-blue-600',    inactive: 'bg-white text-blue-700 border-blue-200 hover:border-blue-400' },
  { value: 2, label: 'Bucket 2', sub: 'Income',  active: 'bg-amber-500 text-white border-amber-500',  inactive: 'bg-white text-amber-700 border-amber-200 hover:border-amber-400' },
  { value: 3, label: 'Bucket 3', sub: 'Growth',  active: 'bg-emerald-600 text-white border-emerald-600', inactive: 'bg-white text-emerald-700 border-emerald-200 hover:border-emerald-400' },
];

const ACCOUNT_OPTS: { value: AccountType; label: string; sub: string; active: string; inactive: string }[] = [
  { value: 'taxable', label: 'Taxable', sub: 'Brokerage',       active: 'bg-sky-600 text-white border-sky-600',      inactive: 'bg-white text-sky-700 border-sky-200 hover:border-sky-400' },
  { value: 'pretax',  label: 'Pre-Tax', sub: 'IRA / 401(k)',    active: 'bg-orange-500 text-white border-orange-500', inactive: 'bg-white text-orange-700 border-orange-200 hover:border-orange-400' },
  { value: 'roth',    label: 'Roth',    sub: 'Roth IRA / 401k', active: 'bg-violet-600 text-white border-violet-600', inactive: 'bg-white text-violet-700 border-violet-200 hover:border-violet-400' },
];

export function InlineBucketTagger({ portfolioId }: { portfolioId: number }) {
  const router = useRouter();
  const [bucket, setBucket] = useState<BucketGroup | null>(null);
  const [account, setAccount] = useState<AccountType | null>(null);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);

  async function save() {
    if (!bucket) return;
    setSaving(true);
    await fetch('/api/portfolios', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: portfolioId, bucket_group: bucket, account_type: account }),
    });
    setSaving(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={e => { e.preventDefault(); setOpen(true); }}
        className="mt-3 text-xs text-slate-400 hover:text-emerald-600 font-medium border border-dashed border-slate-300 hover:border-emerald-400 rounded-lg px-3 py-1.5 transition-colors w-full text-center"
      >
        + Tag bucket &amp; account type
      </button>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 space-y-2" onClick={e => e.preventDefault()}>
      {/* Bucket group */}
      <div className="flex gap-1.5">
        {BUCKET_OPTS.map(o => (
          <button
            key={o.value}
            onClick={() => setBucket(bucket === o.value ? null : o.value)}
            className={`flex-1 border rounded-lg px-2 py-1.5 text-center transition-all ${bucket === o.value ? o.active : o.inactive}`}
          >
            <p className="text-[11px] font-bold leading-tight">{o.label}</p>
            <p className="text-[9px] opacity-75 leading-tight">{o.sub}</p>
          </button>
        ))}
      </div>

      {/* Account type */}
      <div className="flex gap-1.5">
        {ACCOUNT_OPTS.map(o => (
          <button
            key={o.value}
            onClick={() => setAccount(account === o.value ? null : o.value)}
            className={`flex-1 border rounded-lg px-2 py-1.5 text-center transition-all ${account === o.value ? o.active : o.inactive}`}
          >
            <p className="text-[11px] font-bold leading-tight">{o.label}</p>
            <p className="text-[9px] opacity-75 leading-tight">{o.sub}</p>
          </button>
        ))}
      </div>

      {/* Save */}
      <div className="flex gap-2 pt-1">
        <button
          onClick={() => { setOpen(false); setBucket(null); setAccount(null); }}
          className="text-xs text-slate-400 hover:text-slate-600 px-3 py-1.5"
        >
          Cancel
        </button>
        <button
          onClick={save}
          disabled={!bucket || saving}
          className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg py-1.5 transition-colors"
        >
          {saving && <Loader2 className="w-3 h-3 animate-spin" />}
          Save Tag
        </button>
      </div>
    </div>
  );
}
