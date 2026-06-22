(() => {
  if (window.__spikenetRuntimeMounted) return;
  window.__spikenetRuntimeMounted = true;

  const app = 'spikenet';
  const flagsUrl = '/config/feature-flags.json';
  let flags = {
    reactModulesBridge: false,
    feedbackWidget: false,
    performanceMonitor: true,
    'market.trustPanel': true,
    'socialHub.newLayout': true
  };

  function send(endpoint, payload) {
    const body = JSON.stringify({
      app,
      url: window.location.href,
      ...payload
    });

    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      if (navigator.sendBeacon(endpoint, blob)) return;
    }

    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true
    }).catch(() => {});
  }

  function track(event, properties = {}) {
    send('/api/telemetry/events', {
      event,
      type: event,
      properties
    });
  }

  function page(path = window.location.href, properties = {}) {
    track('page_view', {
      path,
      title: document.title,
      ...properties
    });
  }

  function flag(name, fallback = false) {
    return Object.prototype.hasOwnProperty.call(flags, name) ? flags[name] : fallback;
  }

  async function reloadFlags() {
    try {
      const res = await fetch(flagsUrl, { cache: 'no-cache' });
      if (!res.ok) return flags;
      const data = await res.json();
      flags = { ...flags, ...(data.flags || data || {}) };
    } catch (_) {}
    return flags;
  }

  function getLastSection() {
    try {
      return localStorage.getItem('spikenet:last-section') || 'home';
    } catch (_) {
      return 'home';
    }
  }

  function setLastSection(section) {
    try {
      localStorage.setItem('spikenet:last-section', String(section || 'home'));
    } catch (_) {}
  }

  function installClickTracking() {
    document.addEventListener('click', (event) => {
      const target = event.target.closest('[data-track], button, a');
      if (!target) return;

      const label = target.getAttribute('data-track')
        || target.getAttribute('aria-label')
        || target.getAttribute('title')
        || target.textContent
        || target.id
        || target.className
        || 'unknown';

      track('ui_click', {
        label: String(label).trim().slice(0, 90),
        id: target.id || undefined,
        path: window.location.pathname
      });
    }, true);
  }

  function installSectionTracking() {
    const readMode = () => [
      'market-mode',
      'social-hub-mode',
      'group-mode',
      'admin-mode',
      'profile-mode'
    ].find((className) => document.body.classList.contains(className)) || 'home';

    let last = getLastSection();
    const observer = new MutationObserver(() => {
      const active = readMode();
      if (active === last) return;
      last = active;
      setLastSection(active);
      track('section_visible', { section: active });
    });

    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  }

  function installPerformanceTracking() {
    const reportNavigation = () => {
      const nav = performance.getEntriesByType?.('navigation')?.[0];
      if (!nav) return;
      track('performance_metric', {
        name: 'navigation',
        duration: Math.round(nav.duration),
        load: Math.round(nav.loadEventEnd || 0),
        domContentLoaded: Math.round(nav.domContentLoadedEventEnd || 0)
      });
    };

    if (document.readyState === 'complete') {
      setTimeout(reportNavigation, 0);
    } else {
      window.addEventListener('load', reportNavigation, { once: true });
    }

    if ('PerformanceObserver' in window) {
      try {
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            track('performance_metric', {
              name: entry.entryType,
              value: Math.round(entry.value || entry.duration || 0)
            });
          }
        });
        observer.observe({ type: 'largest-contentful-paint', buffered: true });
      } catch (_) {}
    }
  }

  window.SpikeReactModules = {
    track,
    page,
    flag,
    reloadFlags,
    getLastSection,
    setLastSection
  };

  reloadFlags();
  page(`${window.location.pathname}${window.location.search}${window.location.hash}`);
  installClickTracking();
  installSectionTracking();
  installPerformanceTracking();

  window.addEventListener('hashchange', () => page(`${window.location.pathname}${window.location.search}${window.location.hash}`));
  window.addEventListener('popstate', () => page(`${window.location.pathname}${window.location.search}${window.location.hash}`));
})();
