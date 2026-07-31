// Cached Yahoo Finance crumb for authenticated v10 quoteSummary requests.
// Crumbs are valid for ~1 hour; we refresh every 30 minutes to be safe.

let cached: { crumb: string; cookie: string; at: number } | null = null;

export async function getYahooCrumb(): Promise<{ crumb: string; cookie: string } | null> {
  if (cached && Date.now() - cached.at < 1_800_000) return cached;
  try {
    const cookieRes = await fetch('https://fc.yahoo.com', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      redirect: 'follow',
    });

    // Collect all Set-Cookie headers
    const setCookies: string[] = cookieRes.headers.getSetCookie?.()
      ?? [cookieRes.headers.get('set-cookie') ?? ''].filter(Boolean);

    const cookieHeader = setCookies
      .map(c => c.split(';')[0].trim())
      .filter(Boolean)
      .join('; ');

    const crumbRes = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        Cookie: cookieHeader,
      },
    });
    const crumb = await crumbRes.text();
    // Crumb is a plain string ~10 chars; if it looks like JSON it's an error
    if (!crumb || crumb.startsWith('{') || crumb.length > 30) return null;

    cached = { crumb, cookie: cookieHeader, at: Date.now() };
    return cached;
  } catch {
    return null;
  }
}

export async function fetchYahooQuoteSummary(ticker: string, modules: string): Promise<any> {
  const auth = await getYahooCrumb();
  const crumbParam = auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : '';
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(ticker)}?modules=${modules}${crumbParam}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      ...(auth ? { Cookie: auth.cookie } : {}),
    },
    next: { revalidate: 3600 },
  });
  const json = await res.json() as any;
  return json?.quoteSummary?.result?.[0] ?? null;
}
