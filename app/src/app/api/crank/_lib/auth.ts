export function getAllowedCrankSecrets(): string[] {
  return [process.env.CRANK_SECRET, process.env.CRON_SECRET]
    .map((secret) => secret?.trim())
    .filter((secret): secret is string => Boolean(secret));
}

export function isAuthorizedCrankRequest(req: Request): boolean {
  const allowedSecrets = getAllowedCrankSecrets();
  if (allowedSecrets.length === 0) return true;

  const headerSecret = req.headers.get('x-crank-secret')?.trim();
  const authHeader = req.headers.get('authorization')?.trim();
  const bearerSecret = authHeader?.toLowerCase().startsWith('bearer ')
    ? authHeader.slice('Bearer '.length).trim()
    : null;

  return allowedSecrets.some(
    (secret) => headerSecret === secret || bearerSecret === secret
  );
}
