import { useCallback, useEffect, useRef, useState } from "react";

/*
Инструкция:
1. Скопируйте файл в src/modules/api-client.js.
2. Создайте client через createApiClient({ baseUrl: "/api" }).
3. Используйте api.get/post/put/patch/delete или хуки useApiQuery/useApiMutation.
*/

export class ApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = "ApiError";
    this.status = details.status || 0;
    this.data = details.data;
    this.response = details.response;
    this.url = details.url;
    this.method = details.method;
  }
}

const DEFAULT_RETRY_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function isBrowser() {
  return typeof window !== "undefined";
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isBodyAlreadyEncoded(body) {
  return (
    typeof body === "string" ||
    body instanceof FormData ||
    body instanceof Blob ||
    body instanceof ArrayBuffer ||
    body instanceof URLSearchParams
  );
}

function joinUrl(baseUrl, path) {
  if (/^https?:\/\//i.test(path)) return path;
  if (!baseUrl) return path;

  const cleanBase = baseUrl.replace(/\/+$/, "");
  const cleanPath = String(path).replace(/^\/+/, "");
  return `${cleanBase}/${cleanPath}`;
}

function appendQuery(url, query) {
  if (!query || Object.keys(query).length === 0) return url;

  const absolute = /^https?:\/\//i.test(url);
  const parsed = new URL(url, absolute ? undefined : "http://local.react");

  Object.entries(query).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "") return;

    if (Array.isArray(value)) {
      value.forEach((item) => parsed.searchParams.append(key, String(item)));
      return;
    }

    parsed.searchParams.set(key, String(value));
  });

  if (absolute) return parsed.toString();
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

function createAbortTools(timeout, externalSignal) {
  const controller = new AbortController();
  let timeoutId = null;

  const abortFromExternal = () => {
    controller.abort(externalSignal.reason || new DOMException("Aborted", "AbortError"));
  };

  if (externalSignal) {
    if (externalSignal.aborted) {
      abortFromExternal();
    } else {
      externalSignal.addEventListener("abort", abortFromExternal, { once: true });
    }
  }

  if (timeout > 0) {
    timeoutId = window.setTimeout(() => {
      controller.abort(new DOMException("Request timeout", "TimeoutError"));
    }, timeout);
  }

  return {
    signal: controller.signal,
    cleanup() {
      if (timeoutId) window.clearTimeout(timeoutId);
      if (externalSignal) externalSignal.removeEventListener("abort", abortFromExternal);
    },
  };
}

async function parseResponseBody(response, parseAs) {
  if (parseAs === "raw") return response;
  if (response.status === 204 || response.status === 205) return null;

  if (parseAs === "blob") return response.blob();
  if (parseAs === "text") return response.text();

  const contentType = response.headers.get("content-type") || "";
  if (parseAs === "json" || contentType.includes("application/json")) {
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  return response.text();
}

function getRetryDelay(error, attempt, retryDelay) {
  const retryAfter = error.response?.headers?.get("retry-after");

  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return seconds * 1000;

    const dateDelay = new Date(retryAfter).getTime() - Date.now();
    if (Number.isFinite(dateDelay) && dateDelay > 0) return dateDelay;
  }

  const jitter = Math.round(Math.random() * 100);
  return retryDelay * Math.max(1, attempt + 1) + jitter;
}

function shouldRetry(error, attempt, retries, retryStatuses) {
  if (attempt >= retries) return false;
  if (error.name === "TimeoutError") return true;
  if (!(error instanceof ApiError)) return true;
  return retryStatuses.has(error.status);
}

function createCacheKey(method, url, body) {
  if (!body) return `${method}:${url}`;
  if (isBodyAlreadyEncoded(body)) return `${method}:${url}:encoded-body`;
  return `${method}:${url}:${JSON.stringify(body)}`;
}

export function createApiClient(config = {}) {
  const {
    baseUrl = "",
    headers: defaultHeaders = {},
    timeout = 12000,
    retries = 1,
    retryDelay = 450,
    cacheTtl = 0,
    retryStatuses = DEFAULT_RETRY_STATUSES,
    fetcher = fetch,
    getAuthToken,
    onUnauthorized,
    onError,
  } = config;

  const cache = new Map();
  const pending = new Map();

  async function request(path, options = {}) {
    const method = (options.method || "GET").toUpperCase();
    const url = appendQuery(joinUrl(baseUrl, path), options.query);
    const requestCacheTtl = options.cacheTtl ?? cacheTtl;
    const cacheEnabled = options.cache ?? (method === "GET" && requestCacheTtl > 0);
    const dedupe = options.dedupe ?? method === "GET";
    const cacheKey = createCacheKey(method, url, options.body);

    if (cacheEnabled) {
      const cached = cache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) return cached.value;
      cache.delete(cacheKey);
    }

    if (dedupe && pending.has(cacheKey)) return pending.get(cacheKey);

    const promise = performRequest(url, method, options).then((result) => {
      if (cacheEnabled) {
        cache.set(cacheKey, {
          value: result,
          expiresAt: Date.now() + requestCacheTtl,
        });
      }

      return result;
    });

    if (dedupe) {
      pending.set(cacheKey, promise);
      promise.finally(() => pending.delete(cacheKey));
    }

    return promise;
  }

  async function performRequest(url, method, options) {
    const maxRetries = options.retries ?? retries;
    const retryStatusSet = new Set(options.retryStatuses || retryStatuses);
    let attempt = 0;

    while (true) {
      try {
        return await sendOnce(url, method, options);
      } catch (error) {
        if (error instanceof ApiError && error.status === 401 && onUnauthorized) {
          onUnauthorized(error);
        }

        if (!shouldRetry(error, attempt, maxRetries, retryStatusSet)) {
          if (onError) onError(error);
          throw error;
        }

        await sleep(getRetryDelay(error, attempt, options.retryDelay ?? retryDelay));
        attempt += 1;
      }
    }
  }

  async function sendOnce(url, method, options) {
    const headers = new Headers(defaultHeaders);
    Object.entries(options.headers || {}).forEach(([key, value]) => {
      if (value !== undefined && value !== null) headers.set(key, value);
    });

    const token = getAuthToken ? await getAuthToken() : null;
    if (token && !headers.has("authorization")) {
      headers.set("authorization", `Bearer ${token}`);
    }

    let body = options.body;
    if (isObject(body) && !isBodyAlreadyEncoded(body)) {
      if (!headers.has("content-type")) headers.set("content-type", "application/json");
      body = JSON.stringify(body);
    }

    const abortTools = createAbortTools(options.timeout ?? timeout, options.signal);

    try {
      const response = await fetcher(url, {
        method,
        headers,
        body,
        credentials: options.credentials,
        mode: options.mode,
        cache: options.fetchCache,
        signal: abortTools.signal,
      });

      const data = await parseResponseBody(response, options.parseAs || "json");

      if (!response.ok) {
        throw new ApiError(data?.message || response.statusText || "Request failed", {
          status: response.status,
          data,
          response,
          url,
          method,
        });
      }

      return data;
    } finally {
      abortTools.cleanup();
    }
  }

  return {
    request,
    get: (path, options) => request(path, { ...options, method: "GET" }),
    post: (path, body, options) => request(path, { ...options, method: "POST", body }),
    put: (path, body, options) => request(path, { ...options, method: "PUT", body }),
    patch: (path, body, options) => request(path, { ...options, method: "PATCH", body }),
    delete: (path, options) => request(path, { ...options, method: "DELETE" }),
    clearCache: () => cache.clear(),
  };
}

export function useApiQuery(fetcher, deps = [], options = {}) {
  const {
    enabled = true,
    initialData = null,
    keepPreviousData = true,
    onSuccess,
    onError,
  } = options;

  const fetcherRef = useRef(fetcher);
  const abortRef = useRef(null);
  const [state, setState] = useState({
    data: initialData,
    error: null,
    loading: Boolean(enabled),
    called: false,
  });

  useEffect(() => {
    fetcherRef.current = fetcher;
  }, [fetcher]);

  const reload = useCallback(async () => {
    if (!enabled) return null;

    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState((current) => ({
      data: keepPreviousData ? current.data : initialData,
      error: null,
      loading: true,
      called: true,
    }));

    try {
      const data = await fetcherRef.current({ signal: controller.signal });
      setState({ data, error: null, loading: false, called: true });
      if (onSuccess) onSuccess(data);
      return data;
    } catch (error) {
      if (error.name === "AbortError") return null;
      setState((current) => ({ ...current, error, loading: false, called: true }));
      if (onError) onError(error);
      return null;
    }
  }, [enabled, initialData, keepPreviousData, onError, onSuccess]);

  useEffect(() => {
    reload();

    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [reload, ...deps]);

  return { ...state, reload };
}

export function useApiMutation(mutateFn, options = {}) {
  const mutateRef = useRef(mutateFn);
  const [state, setState] = useState({
    data: null,
    error: null,
    loading: false,
    called: false,
  });

  useEffect(() => {
    mutateRef.current = mutateFn;
  }, [mutateFn]);

  const mutate = useCallback(
    async (...args) => {
      setState((current) => ({ ...current, error: null, loading: true, called: true }));

      try {
        const data = await mutateRef.current(...args);
        setState({ data, error: null, loading: false, called: true });
        if (options.onSuccess) options.onSuccess(data);
        return data;
      } catch (error) {
        setState((current) => ({ ...current, error, loading: false, called: true }));
        if (options.onError) options.onError(error);
        throw error;
      }
    },
    [options]
  );

  const reset = useCallback(() => {
    setState({ data: null, error: null, loading: false, called: false });
  }, []);

  return { ...state, mutate, reset };
}

export function createQueryString(query) {
  return appendQuery("/", query).replace(/^\//, "");
}

