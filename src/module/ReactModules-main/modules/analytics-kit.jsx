import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";

/*
Инструкция:
1. Скопируйте файл в src/modules/analytics-kit.jsx.
2. Оберните приложение в <AnalyticsProvider adapters={[ga4Adapter(...)]}>.
3. Отправляйте события через useAnalytics().track(...) или <TrackClick />.
4. Для GA4/Plausible/Umami добавьте официальный script/snippet в index.html.
*/

const AnalyticsContext = createContext({
  track: () => undefined,
  page: () => undefined,
  identify: () => undefined,
});

function canUseWindow() {
  return typeof window !== "undefined";
}

function toAbsoluteUrl(path) {
  if (!canUseWindow()) return path;
  try {
    return new URL(path, window.location.origin).toString();
  } catch {
    return window.location.href;
  }
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload || {}).filter(([, value]) => value !== undefined)
  );
}

function resolveContext(context) {
  if (!context) return {};
  return typeof context === "function" ? context() : context;
}

export function ga4Adapter({ measurementId } = {}) {
  return {
    name: "ga4",
    track(eventName, properties = {}) {
      if (!canUseWindow() || typeof window.gtag !== "function") return;
      window.gtag("event", eventName, cleanPayload(properties));
    },
    page(path, properties = {}) {
      if (!canUseWindow() || typeof window.gtag !== "function") return;

      const pagePath = path || `${window.location.pathname}${window.location.search}`;
      const pageLocation = toAbsoluteUrl(pagePath);

      if (measurementId) {
        window.gtag("config", measurementId, {
          page_path: pagePath,
          page_location: pageLocation,
          ...cleanPayload(properties),
        });
        return;
      }

      window.gtag("event", "page_view", {
        page_path: pagePath,
        page_location: pageLocation,
        ...cleanPayload(properties),
      });
    },
    identify(userId, traits = {}) {
      if (!canUseWindow() || typeof window.gtag !== "function") return;
      window.gtag("set", { user_id: userId, ...cleanPayload(traits) });
    },
  };
}

export function plausibleAdapter({ trackPageviewsAsEvents = false } = {}) {
  return {
    name: "plausible",
    track(eventName, properties = {}) {
      if (!canUseWindow() || typeof window.plausible !== "function") return;
      const props = cleanPayload(properties);
      window.plausible(eventName, Object.keys(props).length ? { props } : undefined);
    },
    page(path, properties = {}) {
      if (!trackPageviewsAsEvents) return;
      this.track("pageview", { path, ...properties });
    },
  };
}

export function umamiAdapter() {
  return {
    name: "umami",
    track(eventName, properties = {}) {
      if (!canUseWindow() || !window.umami || typeof window.umami.track !== "function") return;
      window.umami.track(eventName, cleanPayload(properties));
    },
    page(path, properties = {}) {
      this.track("pageview", { path, ...properties });
    },
  };
}

export function httpAnalyticsAdapter({ endpoint, headers = {}, app } = {}) {
  return {
    name: "http",
    track(eventName, properties = {}) {
      if (!endpoint || !canUseWindow()) return;
      window.fetch(endpoint, {
        method: "POST",
        keepalive: true,
        headers: {
          "content-type": "application/json",
          ...headers,
        },
        body: JSON.stringify({
          type: "event",
          app,
          event: eventName,
          properties: cleanPayload(properties),
          url: window.location.href,
          timestamp: new Date().toISOString(),
        }),
      });
    },
    page(path, properties = {}) {
      this.track("page_view", { path, ...properties });
    },
  };
}

export function consoleAnalyticsAdapter() {
  return {
    name: "console",
    track(eventName, properties = {}) {
      console.info("[analytics:event]", eventName, properties);
    },
    page(path, properties = {}) {
      console.info("[analytics:page]", path, properties);
    },
    identify(userId, traits = {}) {
      console.info("[analytics:identify]", userId, traits);
    },
  };
}

export function AnalyticsProvider({
  adapters = [],
  context,
  children,
  debug = false,
  eventPrefix = "",
}) {
  const adaptersRef = useRef(adapters);

  useEffect(() => {
    adaptersRef.current = adapters;
    adapters.forEach((adapter) => {
      if (typeof adapter.init === "function") adapter.init();
    });
  }, [adapters]);

  const callAdapters = useCallback(
    (method, ...args) => {
      adaptersRef.current.forEach((adapter) => {
        try {
          if (typeof adapter[method] === "function") adapter[method](...args);
        } catch (error) {
          if (debug) console.warn(`[analytics:${adapter.name || "adapter"}]`, error);
        }
      });
    },
    [debug]
  );

  const value = useMemo(
    () => ({
      track(eventName, properties = {}) {
        const fullEventName = `${eventPrefix}${eventName}`;
        callAdapters("track", fullEventName, {
          ...resolveContext(context),
          ...properties,
        });
      },
      page(path, properties = {}) {
        callAdapters("page", path, {
          ...resolveContext(context),
          ...properties,
        });
      },
      identify(userId, traits = {}) {
        callAdapters("identify", userId, traits);
      },
    }),
    [callAdapters, context, eventPrefix]
  );

  return <AnalyticsContext.Provider value={value}>{children}</AnalyticsContext.Provider>;
}

export function useAnalytics() {
  return useContext(AnalyticsContext);
}

export function AnalyticsPageView({ path, title, properties = {} }) {
  const analytics = useAnalytics();
  const resolvedPath =
    path ||
    (canUseWindow() ? `${window.location.pathname}${window.location.search}` : "unknown");

  useEffect(() => {
    analytics.page(resolvedPath, { title, ...properties });
  }, [analytics, resolvedPath, title, properties]);

  return null;
}

export function TrackClick({
  as: Component = "button",
  event,
  properties,
  onClick,
  children,
  ...props
}) {
  const analytics = useAnalytics();

  const handleClick = useCallback(
    (clickEvent) => {
      if (event) analytics.track(event, typeof properties === "function" ? properties() : properties);
      if (onClick) onClick(clickEvent);
    },
    [analytics, event, onClick, properties]
  );

  return (
    <Component {...props} onClick={handleClick}>
      {children}
    </Component>
  );
}

export function useTrackVisibility(eventName, properties = {}, options = {}) {
  const analytics = useAnalytics();
  const ref = useRef(null);

  useEffect(() => {
    if (!canUseWindow() || !ref.current || !("IntersectionObserver" in window)) return undefined;

    let tracked = false;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !tracked) {
          tracked = true;
          analytics.track(eventName, properties);
          if (options.once !== false) observer.disconnect();
        }
      },
      { threshold: options.threshold ?? 0.5 }
    );

    observer.observe(ref.current);
    return () => observer.disconnect();
  }, [analytics, eventName, options.once, options.threshold, properties]);

  return ref;
}

export function trackOutboundLink(analytics, url, properties = {}) {
  analytics.track("outbound_link_click", {
    url,
    host: (() => {
      try {
        return new URL(url).host;
      } catch {
        return undefined;
      }
    })(),
    ...properties,
  });
}

