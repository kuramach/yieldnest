'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Check, X, Loader2 } from 'lucide-react';

interface Props {
  portfolioId: number;
  initialName: string;
}

export default function PortfolioNameEditor({ portfolioId, initialName }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [input, setInput] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  function cancel() {
    setInput(initialName);
    setEditing(false);
  }

  async function save() {
    const val = input.trim();
    if (!val || val === initialName) { cancel(); return; }
    setSaving(true);
    try {
      await fetch(`/api/portfolios/${portfolioId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: val }),
      });
      router.refresh();
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') save();
    if (e.key === 'Escape') cancel();
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={saving}
          className="text-2xl font-bold text-slate-900 border-b-2 border-emerald-500 bg-transparent focus:outline-none w-full max-w-sm"
        />
        <button
          onClick={save}
          disabled={saving || !input.trim()}
          className="p-1 text-emerald-600 hover:text-emerald-500 disabled:opacity-40"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
        </button>
        <button onClick={cancel} disabled={saving} className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-40">
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="group flex items-center gap-2 text-left"
    >
      <h1 className="text-2xl font-bold text-slate-900">{initialName}</h1>
      <Pencil className="w-4 h-4 text-slate-300 group-hover:text-slate-500 transition-colors" />
    </button>
  );
}
