import React, { useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AnalyticsPageView,
  AnalyticsProvider,
  ErrorBoundary,
  ErrorReporterProvider,
  FeatureFlagsProvider,
  createHttpErrorReporter,
  httpAnalyticsAdapter,
  makeAnalyticsPerformanceReporter,
  useAnalytics,
  useFeatureFlags,
  usePerformanceMonitor,
  usePersistentState
} from '@react-modules';

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

function SpikeModuleRuntime() {
  const analytics = useAnalytics();
  const featureFlags = useFeatureFlags();
  const [lastSection, setLastSection] = usePersistentState('last-section', 'home', {
    namespace: 'spikenet'
  });

  usePerformanceMonitor(makeAnalyticsPerformanceReporter(analytics), {
    sampleRate: 1,
    includeNavigation: true
  });

  useEffect(() => {
    if (!canUseDom()) return undefined;

    window.SpikeReactModules = {
      track: (event, properties = {}) => analytics.track(event, properties),
      page: (path, properties = {}) => analytics.page(path, properties),
      flag: (name, fallback = false) => featureFlags.getFlag(name, fallback),
      reloadFlags: featureFlags.reload,
      getLastSection: () => lastSection,
      setLastSection
    };

    const handleClick = (event) => {
      const target = event.target.closest('[data-track], button, a');
      if (!target) return;

      const label = target.getAttribute('data-track')
        || target.getAttribute('aria-label')
        || target.getAttribute('title')
        || target.textContent
        || target.id
        || target.className
        || 'unknown';

      analytics.track('ui_click', {
        label: String(label).trim().slice(0, 90),
        id: target.id || undefined,
        path: window.location.pathname
      });
    };

    const handleHashOrPop = () => {
      analytics.page(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    };

    document.addEventListener('click', handleClick, true);
    window.addEventListener('hashchange', handleHashOrPop);
    window.addEventListener('popstate', handleHashOrPop);

    return () => {
      document.removeEventListener('click', handleClick, true);
      window.removeEventListener('hashchange', handleHashOrPop);
      window.removeEventListener('popstate', handleHashOrPop);
      delete window.SpikeReactModules;
    };
  }, [analytics, featureFlags, lastSection, setLastSection]);

  useEffect(() => {
    if (!canUseDom()) return undefined;

    const observer = new MutationObserver(() => {
      const activeMode = [
        'market-mode',
        'social-hub-mode',
        'group-mode',
        'admin-mode',
        'profile-mode'
      ].find((className) => document.body.classList.contains(className));

      if (activeMode && activeMode !== lastSection) {
        setLastSection(activeMode);
        analytics.track('section_visible', { section: activeMode });
      }
    });

    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, [analytics, lastSection, setLastSection]);

  return <AnalyticsPageView title="SpikeNet" />;
}

function SpikeReactModulesApp() {
  const analyticsAdapters = useMemo(() => [
    httpAnalyticsAdapter({
      endpoint: '/api/telemetry/events',
      app: 'spikenet'
    })
  ], []);

  const reportError = useMemo(() => createHttpErrorReporter({
    endpoint: '/api/telemetry/client-errors',
    app: 'spikenet',
    environment: document.documentElement.dataset.env || 'browser'
  }), []);

  return (
    <ErrorReporterProvider reportError={reportError}>
      <ErrorBoundary name="spikenet-react-modules" fallback={null}>
        <AnalyticsProvider adapters={analyticsAdapters} eventPrefix="spikenet_">
          <FeatureFlagsProvider
            endpoint="/config/feature-flags.json"
            initialFlags={{
              reactModulesBridge: true,
              feedbackWidget: false,
              performanceMonitor: true
            }}
            refreshInterval={5 * 60 * 1000}
          >
            <SpikeModuleRuntime />
          </FeatureFlagsProvider>
        </AnalyticsProvider>
      </ErrorBoundary>
    </ErrorReporterProvider>
  );
}

function mount() {
  if (!canUseDom()) return;

  const rootEl = document.getElementById('spikenet-react-modules-root');
  if (!rootEl || rootEl.dataset.mounted === 'true') return;

  rootEl.dataset.mounted = 'true';
  createRoot(rootEl).render(<SpikeReactModulesApp />);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', mount, { once: true });
} else {
  mount();
}
