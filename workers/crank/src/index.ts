interface Env {
  APP_URL: string;
  CRANK_LIMIT?: string;
  CRANK_SECRET: string;
  CRANK_TIMEOUT_MS?: string;
}

type CrankResult = {
  ok: boolean;
  appUrl: string;
  status?: number;
  durationMs: number;
  body: string;
  error?: string;
};

function json(data: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...init?.headers,
    },
  });
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

async function runCrank(env: Env, limitOverride?: string | null): Promise<CrankResult> {
  const started = Date.now();
  const appUrl = env.APP_URL.replace(/\/$/, '');
  const limit = limitOverride || env.CRANK_LIMIT || '1';
  const timeoutMs = parsePositiveInt(env.CRANK_TIMEOUT_MS, 25000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('crank-timeout'), timeoutMs);

  try {
    if (!env.APP_URL || !env.CRANK_SECRET) {
      throw new Error('APP_URL and CRANK_SECRET are required');
    }

    const response = await fetch(`${appUrl}/api/crank/run?limit=${encodeURIComponent(limit)}`, {
      method: 'GET',
      headers: {
        authorization: `Bearer ${env.CRANK_SECRET}`,
        'x-crank-secret': env.CRANK_SECRET,
      },
      signal: controller.signal,
    });

    const body = await response.text();
    const result = {
      ok: response.ok,
      appUrl,
      status: response.status,
      durationMs: Date.now() - started,
      body,
      error: response.ok ? undefined : `Crank failed with ${response.status}`,
    };

    if (result.ok) {
      console.log(`Crank success status=${response.status} durationMs=${result.durationMs} body=${body.slice(0, 500)}`);
    } else {
      console.error(`Crank failed status=${response.status} durationMs=${result.durationMs} body=${body.slice(0, 1000)}`);
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const result = {
      ok: false,
      appUrl,
      durationMs: Date.now() - started,
      body: '',
      error: message,
    };
    console.error(`Crank error durationMs=${result.durationMs} error=${message}`);
    return result;
  } finally {
    clearTimeout(timeout);
  }
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCrank(env).then((result) => {
      if (!result.ok) {
        console.error(`Scheduled crank did not complete: ${result.error || result.body}`);
      }
    }));
  },

  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (url.pathname !== '/run') {
      return json({
        ok: true,
        service: 'eclipse-crank',
        appUrl: env.APP_URL,
        limit: env.CRANK_LIMIT || '10',
        run: `${url.origin}/run`,
      });
    }

    const result = await runCrank(env, url.searchParams.get('limit'));
    return json(result, { status: result.ok ? 200 : 502 });
  },
};
