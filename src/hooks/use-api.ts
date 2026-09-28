import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/api/client.ts";
import type { ApiEndpoint } from "@/types/api.ts";

const API_INVALIDATED = "stockflow:api-invalidated";
const QUERY_CACHE_TTL = 30_000;
const QUERY_CACHE_MAX_ENTRIES = 120;

type ApiInvalidationDetail = {
  resources?: string[];
};

type QueryCacheEntry = {
  data?: unknown;
  updatedAt: number;
  promise?: Promise<unknown>;
  lastAccessedAt: number;
};

type QueryOptions = {
  refreshInterval?: number;
};

const queryCache = new Map<string, QueryCacheEntry>();

function resourceKey(path: string) {
  return path.split("/").filter(Boolean)[0] ?? path;
}

function shouldRefresh(path: string, event: Event) {
  const resources = (event as CustomEvent<ApiInvalidationDetail>).detail?.resources;
  return !resources?.length || resources.includes(resourceKey(path));
}

export function clearApiQueryCache() {
  queryCache.clear();
}

function resolvePath(path: string, input: Record<string, unknown>) {
  const consumed = new Set<string>();
  const resolved = path.replace(/:([A-Za-z]+)/g, (_, key: string) => {
    consumed.add(key);
    return encodeURIComponent(String(input[key] ?? ""));
  });
  const remaining = Object.fromEntries(Object.entries(input).filter(([key, value]) => !consumed.has(key) && value !== undefined));
  return { resolved, remaining };
}

function queryKey(endpoint: ApiEndpoint<unknown, any>, input: Record<string, unknown> | "skip") {
  return `${endpoint.path}:${input === "skip" ? "skip" : JSON.stringify(input)}`;
}

function cacheEntry(key: string) {
  const existing = queryCache.get(key);
  if (existing) {
    existing.lastAccessedAt = Date.now();
    return existing;
  }
  if (queryCache.size >= QUERY_CACHE_MAX_ENTRIES) {
    const leastRecentlyUsed = [...queryCache.entries()]
      .filter(([, entry]) => !entry.promise)
      .sort(([, left], [, right]) => left.lastAccessedAt - right.lastAccessedAt)[0]?.[0];
    if (leastRecentlyUsed) queryCache.delete(leastRecentlyUsed);
  }
  const created: QueryCacheEntry = { updatedAt: 0, lastAccessedAt: Date.now() };
  queryCache.set(key, created);
  return created;
}

function hasCachedData(entry: QueryCacheEntry | undefined) {
  return entry?.data !== undefined;
}

function requestQuery<TResult>(endpoint: ApiEndpoint<TResult, any>, input: Record<string, unknown>, key: string, force = false) {
  const entry = cacheEntry(key);
  const isFresh = hasCachedData(entry) && Date.now() - entry.updatedAt < QUERY_CACHE_TTL;
  if (!force && isFresh) return Promise.resolve(entry.data as TResult);
  if (entry.promise) return entry.promise as Promise<TResult>;

  const { resolved, remaining } = resolvePath(endpoint.path, input);
  const promise = apiClient.get<TResult>(resolved, { params: remaining }).then(({ data }) => {
    entry.data = data;
    entry.updatedAt = Date.now();
    entry.lastAccessedAt = entry.updatedAt;
    return data;
  }).finally(() => {
    delete entry.promise;
  });
  entry.promise = promise;
  return promise;
}

export function useApiQuery<TResult>(endpoint: ApiEndpoint<TResult, any>, input?: Record<string, unknown> | "skip", options?: { refreshInterval?: number }) {
  const [data, setData] = useState<TResult | undefined>(() => {
    const inputKey = input === "skip" ? "skip" : JSON.stringify(input ?? {});
    return queryCache.get(`${endpoint.path}:${inputKey}`)?.data as TResult | undefined;
  });
  const key = JSON.stringify(input ?? {});
  const skipped = input === "skip";
  const stableInput = useMemo(() => (skipped ? "skip" : JSON.parse(key) as Record<string, unknown>), [key, skipped]);
  const cacheKey = queryKey(endpoint, stableInput);
  const requestId = useRef(0);

  const load = useCallback(async (force = false) => {
    if (stableInput === "skip") return;
    const currentRequest = ++requestId.current;
    try {
      const nextData = await requestQuery(endpoint, stableInput, cacheKey, force);
      if (currentRequest === requestId.current) setData(nextData);
    } catch (cause) {
      console.error(`API request failed: ${endpoint.path}`, cause);
      if (currentRequest === requestId.current && !hasCachedData(queryCache.get(cacheKey))) setData(endpoint.empty);
    }
  }, [cacheKey, endpoint, stableInput]);

  useEffect(() => {
    void load();
    const refresh = (event: Event) => {
      if (shouldRefresh(endpoint.path, event)) void load(true);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    window.addEventListener(API_INVALIDATED, refresh);
    if (options?.refreshInterval) document.addEventListener("visibilitychange", refreshWhenVisible);
    const timer = options?.refreshInterval ? window.setInterval(() => {
      if (document.visibilityState === "visible") void load(true);
    }, options.refreshInterval) : undefined;
    return () => {
      window.removeEventListener(API_INVALIDATED, refresh);
      if (options?.refreshInterval) document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (timer) window.clearInterval(timer);
    };
  }, [endpoint.path, load, options?.refreshInterval]);

  return data;
}

export function useApiMutation<TResult>(endpoint: ApiEndpoint<TResult, any>) {
  return useCallback(async (input: Record<string, unknown> = {}) => {
    const { resolved, remaining } = resolvePath(endpoint.path, input);
    const response = endpoint.method === "DELETE"
      ? await apiClient.delete<TResult>(resolved, { data: remaining })
      : await apiClient.request<TResult>({ method: endpoint.method, url: resolved, data: remaining });
    const resource = resourceKey(endpoint.path);
    window.dispatchEvent(new CustomEvent<ApiInvalidationDetail>(API_INVALIDATED, {
      detail: { resources: [resource, "dashboard"] },
    }));
    return response.data;
  }, [endpoint]);
}

export function useApiQueryState<TResult>(endpoint: ApiEndpoint<TResult, any>, input?: Record<string, unknown> | "skip", options?: QueryOptions) {
  const key = JSON.stringify(input ?? {});
  const skipped = input === "skip";
  const stableInput = useMemo(() => skipped ? "skip" : JSON.parse(key) as Record<string, unknown>, [key, skipped]);
  const cacheKey = queryKey(endpoint, stableInput);
  const [data, setData] = useState<TResult>(() => queryCache.get(cacheKey)?.data as TResult);
  const [isFetching, setIsFetching] = useState(input !== "skip" && !hasCachedData(queryCache.get(cacheKey)));
  const [error, setError] = useState<unknown>(null);
  const requestId = useRef(0);
  const reload = useCallback(async (force = false) => {
    if (stableInput === "skip") return;
    const currentRequest = ++requestId.current;
    setIsFetching(true); setError(null);
    try {
      const nextData = await requestQuery(endpoint, stableInput, cacheKey, force);
      if (currentRequest === requestId.current) setData(nextData);
    } catch (cause) {
      if (currentRequest === requestId.current) {
        setError(cause);
        if (!hasCachedData(queryCache.get(cacheKey))) setData(endpoint.empty);
      }
    } finally {
      if (currentRequest === requestId.current) setIsFetching(false);
    }
  }, [cacheKey, endpoint, stableInput]);
  useEffect(() => {
    const cached = queryCache.get(cacheKey);
    setData(cached?.data as TResult);
    setError(null);
    if (stableInput !== "skip") void reload();
    const refresh = (event: Event) => {
      if (shouldRefresh(endpoint.path, event)) void reload(true);
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void reload();
    };
    window.addEventListener(API_INVALIDATED, refresh);
    if (options?.refreshInterval) document.addEventListener("visibilitychange", refreshWhenVisible);
    const timer = options?.refreshInterval ? window.setInterval(() => {
      if (document.visibilityState === "visible") void reload(true);
    }, options.refreshInterval) : undefined;
    return () => {
      window.removeEventListener(API_INVALIDATED, refresh);
      if (options?.refreshInterval) document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (timer) window.clearInterval(timer);
    };
  }, [cacheKey, endpoint.path, reload, stableInput, options?.refreshInterval]);
  return { data, isLoading: isFetching && data === undefined, isFetching, isRefreshing: isFetching && data !== undefined, error, reload };
}
