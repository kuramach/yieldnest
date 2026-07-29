import { createServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';

export async function createClient() {
  const cookieStore = await cookies();
  const headerStore = await headers();
  const host = headerStore.get('host') ?? '';
  const cookieDomain = host.endsWith('eazybudget.com') ? '.eazybudget.com' : undefined;

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, cookieDomain ? { ...options, domain: cookieDomain } : options)
            );
          } catch {
            // Called from Server Component — middleware handles session refresh
          }
        },
      },
    }
  );
}
