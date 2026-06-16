interface Env {
  APP_URL: string;
  CRANK_LIMIT?: string;
  CRANK_SECRET: string;
}

async function runCrank(env: Env): Promise<Response> {
  const appUrl = env.APP_URL.replace(/\/$/, '');
  const limit = env.CRANK_LIMIT || '10';
  const response = await fetch(`${appUrl}/api/crank/run?limit=${encodeURIComponent(limit)}`, {
    method: 'GET',
    headers: {
      authorization: `Bearer ${env.CRANK_SECRET}`,
      'x-crank-secret': env.CRANK_SECRET,
    },
  });

  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Crank failed with ${response.status}: ${body}`);
  }

  console.log(`Crank success: ${body.slice(0, 500)}`);
  return new Response(body, {
    status: response.status,
    headers: { 'content-type': response.headers.get('content-type') || 'application/json' },
  });
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(runCrank(env));
  },

  async fetch(_request: Request, env: Env) {
    return runCrank(env);
  },
};
