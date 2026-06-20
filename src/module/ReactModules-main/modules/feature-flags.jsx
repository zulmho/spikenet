import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

/*
Инструкция:
1. Скопируйте файл в src/modules/feature-flags.jsx.
2. Оберните приложение в <FeatureFlagsProvider initialFlags={{ newUi: true }}>.
3. Используйте useFeatureFlag("newUi") или <FeatureGate flag="newUi" />.
4. Для удаленного JSON передайте endpoint="/config/feature-flags.json".
*/

const DEFAULT_OVERRIDES_KEY = "feature-flags:overrides";
const OVERRIDES_EVENT = "feature-flags:overrides-changed";

const FeatureFlagsContext = createContext({
  flags: {},
  loading: false,
  error: null,
  reload: () => Promise.resolve(),
  getFlag: (_name, fallback) => fallback,
});

function canUseWindow() {
  return typeof window !== "undefined";
}

function safeParse(value, fallback) {
  try {
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function normalizeFlags(data) {
  if (!data || typeof data !== "object") return {};
  if (data.flags && typeof data.flags === "object") return data.flags;
  return data;
}

function getNestedValue(source, path) {
  if (!source || !path) return undefined;
  if (Object.prototype.hasOwnProperty.call(source, path)) return source[path];

  return String(path)
    .split(".")
    .reduce((current, segment) => {
      if (current && Object.prototype.hasOwnProperty.call(current, segment)) {
        return current[segment];
      }
      return undefined;
    }, source);
}

function readOverrides(storageKey) {
  if (!canUseWindow()) return {};
  return safeParse(window.localStorage.getItem(storageKey), {});
}

function writeOverrides(storageKey, overrides) {
  if (!canUseWindow()) return;
  window.localStorage.setItem(storageKey, JSON.stringify(overrides));
  window.dispatchEvent(new CustomEvent(OVERRIDES_EVENT, { detail: { storageKey } }));
}

export function setFlagOverride(name, value, storageKey = DEFAULT_OVERRIDES_KEY) {
  const overrides = readOverrides(storageKey);
  writeOverrides(storageKey, { ...overrides, [name]: value });
}

export function clearFlagOverride(name, storageKey = DEFAULT_OVERRIDES_KEY) {
  const overrides = readOverrides(storageKey);
  delete overrides[name];
  writeOverrides(storageKey, overrides);
}

export function clearFlagOverrides(storageKey = DEFAULT_OVERRIDES_KEY) {
  writeOverrides(storageKey, {});
}

export function FeatureFlagsProvider({
  children,
  endpoint,
  initialFlags = {},
  fetchOptions,
  refreshInterval = 0,
  storageKey = DEFAULT_OVERRIDES_KEY,
  onError,
}) {
  const [flags, setFlags] = useState(initialFlags);
  const [overrides, setOverrides] = useState(() => readOverrides(storageKey));
  const [loading, setLoading] = useState(Boolean(endpoint));
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    if (!endpoint) return initialFlags;

    setLoading(true);
    setError(null);

    try {
      const url = typeof endpoint === "function" ? endpoint() : endpoint;
      const response = await fetch(url, {
        cache: "no-store",
        ...fetchOptions,
      });

      if (!response.ok) throw new Error(`Feature flags request failed: ${response.status}`);

      const data = normalizeFlags(await response.json());
      setFlags((current) => ({ ...current, ...data }));
      return data;
    } catch (requestError) {
      setError(requestError);
      if (onError) onError(requestError);
      return null;
    } finally {
      setLoading(false);
    }
  }, [endpoint, fetchOptions, initialFlags, onError]);

  useEffect(() => {
    reload();
  }, [reload]);

  useEffect(() => {
    if (!refreshInterval) return undefined;
    const timer = window.setInterval(reload, refreshInterval);
    return () => window.clearInterval(timer);
  }, [refreshInterval, reload]);

  useEffect(() => {
    if (!canUseWindow()) return undefined;

    const syncOverrides = () => setOverrides(readOverrides(storageKey));
    const syncCustom = (event) => {
      if (event.detail?.storageKey === storageKey) syncOverrides();
    };

    window.addEventListener("storage", syncOverrides);
    window.addEventListener(OVERRIDES_EVENT, syncCustom);

    return () => {
      window.removeEventListener("storage", syncOverrides);
      window.removeEventListener(OVERRIDES_EVENT, syncCustom);
    };
  }, [storageKey]);

  const value = useMemo(() => {
    const getFlag = (name, fallback = false) => {
      const overrideValue = getNestedValue(overrides, name);
      if (overrideValue !== undefined) return overrideValue;

      const flagValue = getNestedValue(flags, name);
      return flagValue !== undefined ? flagValue : fallback;
    };

    return {
      flags,
      overrides,
      loading,
      error,
      reload,
      getFlag,
    };
  }, [error, flags, loading, overrides, reload]);

  return <FeatureFlagsContext.Provider value={value}>{children}</FeatureFlagsContext.Provider>;
}

export function useFeatureFlags() {
  return useContext(FeatureFlagsContext);
}

export function useFeatureFlag(name, fallback = false) {
  return useFeatureFlags().getFlag(name, fallback);
}

export function FeatureGate({ flag, fallback = null, children, when }) {
  const enabled = useFeatureFlag(flag, false);
  const shouldRender = typeof when === "function" ? when(enabled) : Boolean(enabled);
  return shouldRender ? <>{children}</> : <>{fallback}</>;
}

