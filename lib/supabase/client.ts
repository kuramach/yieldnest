import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  const hostname = typeof window !== 'undefined' ? window.location.hostname : '';
  const cookieDomain = hostname.endsWith('eazybudget.com') ? '.eazybudget.com' : undefined;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    cookieDomain ? { cookieOptions: { domain: cookieDomain } } : undefined
  );
}
