export const WORKER_SECRET_HEADER = "x-whispervault-worker-secret";

export const getWorkerSecret = (env: NodeJS.ProcessEnv = process.env): string | null => {
  const secret = env.WHISPERVAULT_WORKER_SECRET?.trim() ?? "";
  return secret || null;
};

export const isWorkerAuthorized = (request: Request, env: NodeJS.ProcessEnv = process.env): boolean => {
  const expectedSecret = getWorkerSecret(env);

  if (!expectedSecret) {
    return true;
  }

  const headerSecret = request.headers.get(WORKER_SECRET_HEADER)?.trim();
  const authorization = request.headers.get("authorization")?.trim() ?? "";
  const bearerSecret = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : "";

  return headerSecret === expectedSecret || bearerSecret === expectedSecret;
};
