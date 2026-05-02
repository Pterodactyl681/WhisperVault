import type { SupabaseDatabaseConfig } from "./config";

type SupabaseFilterValue = string | number | boolean;

type SupabaseFetchInit = {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
};

type SupabaseFetchResponse = {
  ok: boolean;
  status: number;
  statusText: string;
  text(): Promise<string>;
};

export type SupabaseFetch = (input: string, init?: SupabaseFetchInit) => Promise<SupabaseFetchResponse>;

export interface SupabaseRestClientOptions {
  config: SupabaseDatabaseConfig;
  fetch?: SupabaseFetch;
}

const getDefaultFetch = (): SupabaseFetch => {
  const fetchFn = (globalThis as { fetch?: SupabaseFetch }).fetch;

  if (!fetchFn) {
    throw new Error("Database storage requires a runtime with fetch support.");
  }

  return fetchFn.bind(globalThis) as SupabaseFetch;
};

const parseJson = <T>(raw: string): T => {
  if (!raw.trim()) {
    return [] as T;
  }

  return JSON.parse(raw) as T;
};

export class SupabaseRestClient {
  private readonly baseUrl: string;

  private readonly serviceRoleKey: string;

  private readonly fetch: SupabaseFetch;

  constructor(options: SupabaseRestClientOptions) {
    this.baseUrl = options.config.url.replace(/\/+$/, "");
    this.serviceRoleKey = options.config.serviceRoleKey;
    this.fetch = options.fetch ?? getDefaultFetch();
  }

  async select<T>(
    table: string,
    filters: Record<string, SupabaseFilterValue> = {},
    options: { order?: string } = {}
  ): Promise<T[]> {
    const searchParams = new URLSearchParams({ select: "*" });

    for (const [key, value] of Object.entries(filters)) {
      searchParams.set(key, `eq.${String(value)}`);
    }

    if (options.order) {
      searchParams.set("order", options.order);
    }

    return this.request<T[]>("GET", table, searchParams);
  }

  async insert<T>(table: string, rows: unknown): Promise<T[]> {
    return this.request<T[]>("POST", table, new URLSearchParams(), rows);
  }

  async update<T>(
    table: string,
    filters: Record<string, SupabaseFilterValue>,
    patch: unknown
  ): Promise<T[]> {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(filters)) {
      searchParams.set(key, `eq.${String(value)}`);
    }

    return this.request<T[]>("PATCH", table, searchParams, patch);
  }

  async delete(table: string, filters: Record<string, SupabaseFilterValue>): Promise<void> {
    const searchParams = new URLSearchParams();

    for (const [key, value] of Object.entries(filters)) {
      searchParams.set(key, `eq.${String(value)}`);
    }

    await this.request<unknown[]>("DELETE", table, searchParams);
  }

  private async request<T>(
    method: string,
    table: string,
    searchParams: URLSearchParams,
    body?: unknown
  ): Promise<T> {
    const query = searchParams.toString();
    const response = await this.fetch(`${this.baseUrl}/rest/v1/${table}${query ? `?${query}` : ""}`, {
      method,
      headers: {
        apikey: this.serviceRoleKey,
        Authorization: `Bearer ${this.serviceRoleKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });

    const raw = await response.text();

    if (!response.ok) {
      throw new Error(
        `Supabase ${method} ${table} failed with ${response.status} ${response.statusText}: ${raw || "No response body."}`
      );
    }

    return parseJson<T>(raw);
  }
}
