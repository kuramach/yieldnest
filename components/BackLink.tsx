'use client';
import { useSearchParams } from 'next/navigation';
import { ExternalLink } from 'lucide-react';

const DEFAULT_BACK = 'https://360-retirement.eazybudget.com/dashboard';

export default function BackLink() {
  const params = useSearchParams();
  const returnTo = params.get('returnTo');
  const href = returnTo ? decodeURIComponent(returnTo) : DEFAULT_BACK;

  return (
    <a
      href={href}
      className="flex items-center gap-2 px-3 py-2 text-xs text-violet-600 hover:text-violet-700 hover:bg-violet-50 rounded-lg transition-colors font-medium"
    >
      <ExternalLink className="w-3.5 h-3.5" />
      ← Retirement Planner
    </a>
  );
}
