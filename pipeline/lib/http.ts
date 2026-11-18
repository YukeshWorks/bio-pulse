/**
 * Minimal HTTP client used by every collector: timeouts, bounded retries with backoff for
 * transient failures (429 / 5xx / network), per-host pacing and an honest User-Agent.
 * `fetchImpl` is injectable so tests never touch the network.
 */

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly url: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export interface HttpResponse {
  status: number;
  ok: boolean;
  url: string;
  headers: Headers;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'HEAD';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  /** Do not throw on non-2xx; return the response (used for URL verification). */
  allowErrorStatus?: boolean;
  redirect?: 'follow' | 'manual';
}

export interface HttpClient {
  request(url: string, opts?: RequestOptions): Promise<HttpResponse>;
  getJson<T = unknown>(url: string, opts?: RequestOptions): Promise<T>;
  getText(url: string, opts?: RequestOptions): Promise<string>;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface HttpClientOptions {
  fetchImpl?: FetchLike;
  userAgent?: string;
  /** Minimum delay between requests to the same host (ms). */
  minIntervalMs?: Record<string, number>;
  defaultIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
  baseBackoffMs?: number;
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createHttpClient(options: HttpClientOptions = {}): HttpClient {
  const fetchImpl: FetchLike = options.fetchImpl ?? ((input, init) => fetch(input, init));
  const sleep = options.sleep ?? realSleep;
  const userAgent =
    options.userAgent ??
    `BioPulse/1.0 (biotechnology literature monitor; +https://github.com/${process.env.GITHUB_REPOSITORY ?? 'biopulse'})`;
  const lastCall = new Map<string, number>();
  const baseBackoff = options.baseBackoffMs ?? 1000;

  async function pace(url: string) {
    const host = new URL(url).host;
    const interval = options.minIntervalMs?.[host] ?? options.defaultIntervalMs ?? 0;
    if (interval <= 0) return;
    const prev = lastCall.get(host) ?? 0;
    const wait = prev + interval - Date.now();
    if (wait > 0) await sleep(wait);
    lastCall.set(host, Date.now());
  }

  async function request(url: string, opts: RequestOptions = {}): Promise<HttpResponse> {
    const retries = opts.retries ?? 2;
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt++) {
      await pace(url);
      try {
        const res = await fetchImpl(url, {
          method: opts.method ?? 'GET',
          headers: { 'User-Agent': userAgent, ...opts.headers },
          body: opts.body,
          redirect: opts.redirect ?? 'follow',
          signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
        });
        const transient = res.status === 429 || res.status >= 500;
        if (transient && attempt < retries) {
          const retryAfter = Number(res.headers.get('retry-after'));
          await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter * 1000, 30_000) : baseBackoff * 2 ** attempt);
          continue;
        }
        if (!res.ok && !opts.allowErrorStatus) {
          throw new HttpError(`HTTP ${res.status} for ${redact(url)}`, res.status, redact(url));
        }
        return {
          status: res.status,
          ok: res.ok,
          url: res.url || url,
          headers: res.headers,
          text: () => res.text(),
          json: async <T>() => {
            const body = await res.text();
            try {
              return JSON.parse(body) as T;
            } catch {
              throw new HttpError(`Invalid JSON from ${redact(url)}`, res.status, redact(url));
            }
          },
        };
      } catch (err) {
        if (err instanceof HttpError) throw err;
        lastError = err;
        if (attempt < retries) {
          await sleep(baseBackoff * 2 ** attempt);
          continue;
        }
      }
    }
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    throw new HttpError(`Network error for ${redact(url)}: ${msg}`, null, redact(url));
  }

  return {
    request,
    async getJson<T>(url: string, opts?: RequestOptions) {
      const res = await request(url, { ...opts, headers: { Accept: 'application/json', ...opts?.headers } });
      return res.json<T>();
    },
    async getText(url: string, opts?: RequestOptions) {
      const res = await request(url, opts);
      return res.text();
    },
  };
}

/** Remove credentials from URLs before they reach logs or error messages. */
export function redact(url: string): string {
  try {
    const u = new URL(url);
    for (const key of ['api_key', 'apikey', 'key', 'token', 'email']) {
      if (u.searchParams.has(key)) u.searchParams.set(key, '***');
    }
    return u.toString();
  } catch {
    return url;
  }
}
