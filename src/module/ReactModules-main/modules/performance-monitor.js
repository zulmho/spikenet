import { useEffect } from "react";

/*
Инструкция:
1. Скопируйте файл в src/modules/performance-monitor.js.
2. Вызовите usePerformanceMonitor((metric) => analytics.track("performance_metric", metric)).
3. Подключайте один раз на корне приложения.
*/

function canUsePerformance() {
  return (
    typeof window !== "undefined" &&
    typeof PerformanceObserver !== "undefined" &&
    typeof performance !== "undefined"
  );
}

function supportsEntry(type) {
  return PerformanceObserver.supportedEntryTypes?.includes(type);
}

function observe(type, callback, options = {}) {
  if (!canUsePerformance() || !supportsEntry(type)) return () => undefined;

  try {
    const observer = new PerformanceObserver(callback);
    observer.observe({ type, buffered: true, ...options });
    return () => observer.disconnect();
  } catch {
    return () => undefined;
  }
}

function rateMetric(name, value) {
  const thresholds = {
    LCP: [2500, 4000],
    CLS: [0.1, 0.25],
    INP: [200, 500],
    FID: [100, 300],
    TTFB: [800, 1800],
  };

  const [good, poor] = thresholds[name] || [];
  if (good === undefined) return "unknown";
  if (value <= good) return "good";
  if (value <= poor) return "needs-improvement";
  return "poor";
}

function createEmitter(report, options) {
  const prefix = options.eventPrefix || "";

  return (metric) => {
    const enriched = {
      ...metric,
      name: `${prefix}${metric.name}`,
      rating: metric.rating || rateMetric(metric.name, metric.value),
      url: typeof window !== "undefined" ? window.location.href : undefined,
      timestamp: new Date().toISOString(),
    };

    if (report) report(enriched);
    else console.info("[performance]", enriched);
  };
}

function onPageHidden(callback) {
  if (typeof document === "undefined") return () => undefined;

  const handleVisibility = () => {
    if (document.visibilityState === "hidden") callback();
  };

  window.addEventListener("pagehide", callback);
  document.addEventListener("visibilitychange", handleVisibility);

  return () => {
    window.removeEventListener("pagehide", callback);
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}

function reportNavigationTiming(emit) {
  if (!performance.getEntriesByType) return;

  const nav = performance.getEntriesByType("navigation")[0];
  if (!nav) return;

  emit({
    name: "TTFB",
    value: nav.responseStart,
    unit: "ms",
    extra: {
      domContentLoaded: nav.domContentLoadedEventEnd,
      load: nav.loadEventEnd,
      transferSize: nav.transferSize,
    },
  });
}

export function installPerformanceMonitor(options = {}) {
  const {
    report,
    sampleRate = 1,
    includeNavigation = true,
    includeResourceTiming = false,
  } = options;

  if (!canUsePerformance()) return () => undefined;
  if (Math.random() > sampleRate) return () => undefined;

  const emit = createEmitter(report, options);
  const cleanups = [];

  if (includeNavigation) {
    const sendNavigation = () => reportNavigationTiming(emit);

    if (document.readyState === "complete") {
      window.setTimeout(sendNavigation, 0);
    } else {
      window.addEventListener("load", sendNavigation, { once: true });
      cleanups.push(() => window.removeEventListener("load", sendNavigation));
    }
  }

  let lcpEntry = null;
  let lcpSent = false;
  cleanups.push(
    observe("largest-contentful-paint", (list) => {
      const entries = list.getEntries();
      lcpEntry = entries[entries.length - 1] || lcpEntry;
    })
  );

  let clsValue = 0;
  let clsSent = false;
  cleanups.push(
    observe("layout-shift", (list) => {
      list.getEntries().forEach((entry) => {
        if (!entry.hadRecentInput) clsValue += entry.value;
      });
    })
  );

  let inpValue = 0;
  let inpSent = false;
  cleanups.push(
    observe(
      "event",
      (list) => {
        list.getEntries().forEach((entry) => {
          if (entry.duration > inpValue) inpValue = entry.duration;
        });
      },
      { durationThreshold: 40 }
    )
  );

  cleanups.push(
    observe("first-input", (list) => {
      const first = list.getEntries()[0];
      if (!first) return;

      emit({
        name: "FID",
        value: first.processingStart - first.startTime,
        unit: "ms",
      });
    })
  );

  if (includeResourceTiming) {
    cleanups.push(
      observe("resource", (list) => {
        list.getEntries().forEach((entry) => {
          if (entry.initiatorType === "fetch" || entry.initiatorType === "xmlhttprequest") {
            emit({
              name: "RESOURCE",
              value: entry.duration,
              unit: "ms",
              rating: "unknown",
              extra: {
                url: entry.name,
                type: entry.initiatorType,
                transferSize: entry.transferSize,
              },
            });
          }
        });
      })
    );
  }

  cleanups.push(
    onPageHidden(() => {
      if (lcpEntry && !lcpSent) {
        lcpSent = true;
        emit({ name: "LCP", value: lcpEntry.startTime, unit: "ms" });
      }

      if (!clsSent) {
        clsSent = true;
        emit({ name: "CLS", value: clsValue, unit: "score" });
      }

      if (inpValue && !inpSent) {
        inpSent = true;
        emit({ name: "INP", value: inpValue, unit: "ms" });
      }
    })
  );

  return () => cleanups.forEach((cleanup) => cleanup());
}

export function usePerformanceMonitor(report, options = {}) {
  useEffect(() => installPerformanceMonitor({ ...options, report }), [report, options]);
}

export function makeAnalyticsPerformanceReporter(analytics) {
  return (metric) => analytics.track("performance_metric", metric);
}

