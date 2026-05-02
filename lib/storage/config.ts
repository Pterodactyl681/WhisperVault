export type StorageMode = "local" | "database";

export interface SupabaseDatabaseConfig {
  url: string;
  serviceRoleKey: string;
}

const normalizeStorageMode = (value: string | undefined): StorageMode | null => {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();

  if (normalized === "local" || normalized === "database") {
    return normalized;
  }

  throw new Error('Invalid STORAGE_MODE. Expected "local" or "database".');
};

export const hasSupabaseDatabaseEnv = (env: NodeJS.ProcessEnv = process.env): boolean =>
  Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim());

export const hasDatabaseEnv = (env: NodeJS.ProcessEnv = process.env): boolean =>
  hasSupabaseDatabaseEnv(env);

export const getStorageMode = (env: NodeJS.ProcessEnv = process.env): StorageMode => {
  const explicitMode = normalizeStorageMode(env.STORAGE_MODE);

  if (explicitMode) {
    return explicitMode;
  }

  if (env.NODE_ENV === "production" && hasSupabaseDatabaseEnv(env)) {
    return "database";
  }

  return "local";
};

export const getSupabaseDatabaseConfig = (env: NodeJS.ProcessEnv = process.env): SupabaseDatabaseConfig => {
  const url = env.SUPABASE_URL?.trim();
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (url && serviceRoleKey) {
    return {
      url: url.replace(/\/+$/, ""),
      serviceRoleKey
    };
  }

  if (env.DATABASE_URL?.trim()) {
    throw new Error(
      "DATABASE_URL is set, but the runtime database adapter expects Supabase PostgREST credentials. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, or use STORAGE_MODE=local."
    );
  }

  throw new Error(
    "Database storage is enabled but SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are missing. Set both variables or use STORAGE_MODE=local."
  );
};
