import { unstable_cache } from 'next/cache';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

// Cached for 30 min across all serverless invocations via Next.js cache
const getCrumb = unstable_cache(
  async (): Promise<{ crumb: string; cookie: string } | null> => {
    try {
      const cookieRes = await fetch('https://fc.yahoo.com', {
        headers: { 'User-Agent': UA },
        redirect: 'follow',
        signal: AbortSignal.timeout(5000),
      });

      // Collect all set-cookie values
      let cookieHeader = '';
      try {
        const setCookies = (cookieRes.headers as any).getSetCookie?.() as string[] | undefined;
        if (setCookies?.length) {
          cookieHeader = setCookies.map((c: string) => c.split(';')[0].trim()).join('; ');
        } else {
          const raw = cookieRes.headers.get('set-cookie') ?? '';
          cookieHeader = raw.split(';')[0].trim();
        }
      } catch {
        cookieHeader = cookieRes.headers.get('set-cookie')?.split(';')[0]?.trim() ?? '';
      }

      if (!cookieHeader) return null;

      const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
        headers: { 'User-Agent': UA, Cookie: cookieHeader },
        signal: AbortSignal.timeout(5000),
      });
      const crumb = await crumbRes.text();
      if (!crumb || crumb.startsWith('{') || crumb.length > 50) return null;

      return { crumb: crumb.trim(), cookie: cookieHeader };
    } catch {
      return null;
    }
  },
  ['yahoo-finance-crumb'],
  { revalidate: 1800 },
);

export async function fetchYahooQuoteSummary(ticker: string, modules: string): Promise<any> {
  const auth = await getCrumb();
  const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : '';
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}${crumbParam}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        ...(auth ? { Cookie: auth.cookie } : {}),
      },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(8000),
    });
    const json = await res.json() as any;
    return json?.quoteSummary?.result?.[0] ?? null;
  } catch {
    return null;
  }
}
