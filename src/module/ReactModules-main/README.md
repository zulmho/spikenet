# React JS utility modules

Готовый набор из 8 автономных модулей для React-проектов. Их можно копировать целиком в `src/modules` или импортировать из этой папки как локальную библиотеку.

## Быстрое подключение

Есть два рабочих варианта. Не смешивайте их в одном проекте.

### Вариант A: скопировать файлы в проект

1. Скопируйте папку `modules` в проект:

```text
src/
  modules/
    analytics-kit.jsx
    api-client.js
    error-reporter.jsx
    feature-flags.jsx
    feedback-widget.jsx
    geo-weather.jsx
    performance-monitor.js
    persistent-state.js
    index.js
```

2. Импортируйте относительно файла, где пишете import:

```jsx
import {
  AnalyticsProvider,
  ErrorBoundary,
  ErrorReporterProvider,
  FeatureFlagsProvider,
  ga4Adapter,
  createHttpErrorReporter,
} from "./modules";
```

Если компонент лежит глубже, например `src/components/Header.jsx`, путь будет другой:

```jsx
import { useAnalytics } from "../modules";
```

`from "modules"` без `./` или `../` не сработает, если в проекте не настроен alias.

### Вариант B: установить с GitHub как пакет

```powershell
npm install github:kaldyrr/ReactModules
```

После этого импортируйте не из `./modules`, а из имени пакета:

```jsx
import {
  AnalyticsProvider,
  ErrorBoundary,
  FeatureFlagsProvider,
  consoleAnalyticsAdapter,
} from "@kaldyrr/react-modules";
```

Можно импортировать и отдельный модуль:

```jsx
import { createApiClient } from "@kaldyrr/react-modules/api-client";
```

### Базовая вставка в `src/main.jsx` или `src/App.jsx`

```jsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import {
  AnalyticsProvider,
  ErrorBoundary,
  ErrorReporterProvider,
  FeatureFlagsProvider,
  ga4Adapter,
  plausibleAdapter,
  createHttpErrorReporter,
} from "./modules";

const reportError = createHttpErrorReporter({
  endpoint: import.meta.env.VITE_ERROR_ENDPOINT,
  app: "my-react-app",
  release: import.meta.env.VITE_APP_VERSION,
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorReporterProvider reportError={reportError}>
      <ErrorBoundary>
        <AnalyticsProvider
          adapters={[
            ga4Adapter({ measurementId: "G-XXXXXXXXXX" }),
            plausibleAdapter(),
          ]}
        >
          <FeatureFlagsProvider endpoint="/config/feature-flags.json">
            <App />
          </FeatureFlagsProvider>
        </AnalyticsProvider>
      </ErrorBoundary>
    </ErrorReporterProvider>
  </React.StrictMode>
);
```

## Ошибка `Could not resolve "modules"` или `Could not resolve "react"`

Самые частые причины:

1. Написано `from "modules"` вместо относительного пути.

```jsx
// Неправильно, если alias не настроен
import { useAnalytics } from "modules";

// Правильно из src/App.jsx
import { useAnalytics } from "./modules";

// Правильно из src/components/Header.jsx
import { useAnalytics } from "../modules";
```

2. Папка `modules` лежит не там, откуда вы ее импортируете.

Проверьте структуру:

```text
src/
  App.jsx
  modules/
    index.js
    analytics-kit.jsx
```

Тогда из `src/App.jsx` нужен путь `./modules`.

3. Вы проверяете этот репозиторий отдельно, но не установили зависимости.

```powershell
npm install
```

4. В проекте не установлен React.

```powershell
npm install react react-dom
```

5. Вы хотите писать `from "modules"` без относительного пути.

Для Vite добавьте alias в `vite.config.js`:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      modules: path.resolve(__dirname, "src/modules"),
    },
  },
});
```

После этого `import { useAnalytics } from "modules";` будет работать.

## Что внутри

### 1. `analytics-kit.jsx`

Единый слой аналитики для GA4, Plausible, Umami или собственного endpoint.

```jsx
import { AnalyticsPageView, TrackClick, useAnalytics } from "./modules/analytics-kit";

function App() {
  return (
    <>
      <AnalyticsPageView path={window.location.pathname} />
      <TrackClick event="pricing_click" properties={{ place: "header" }}>
        Тарифы
      </TrackClick>
    </>
  );
}

function BuyButton() {
  const analytics = useAnalytics();

  return (
    <button onClick={() => analytics.track("purchase_click", { plan: "pro" })}>
      Купить
    </button>
  );
}
```

Для GA4, Plausible и Umami сначала добавьте их стандартный script/snippet в `index.html` или через ваш менеджер тегов.

### 2. `api-client.js`

Fetch-клиент с `baseUrl`, timeout, retry, кешем GET-запросов, дедупликацией и React-хуками.

```jsx
import { createApiClient, useApiQuery, useApiMutation } from "./modules/api-client";

const api = createApiClient({
  baseUrl: "/api",
  timeout: 10000,
  retries: 2,
  cacheTtl: 30000,
  getAuthToken: () => localStorage.getItem("token"),
});

function Profile() {
  const profile = useApiQuery(
    ({ signal }) => api.get("/profile", { signal }),
    [],
    { initialData: null }
  );

  if (profile.loading) return "Загрузка...";
  if (profile.error) return "Ошибка профиля";

  return <pre>{JSON.stringify(profile.data, null, 2)}</pre>;
}

function SaveButton() {
  const save = useApiMutation((payload) => api.post("/settings", payload));
  return <button onClick={() => save.mutate({ theme: "dark" })}>Сохранить</button>;
}
```

### 3. `persistent-state.js`

`usePersistentState` и `useSessionState`: хранение состояния в `localStorage`/`sessionStorage`, версии, миграции, синхронизация между вкладками.

```jsx
import { usePersistentState } from "./modules/persistent-state";

function ThemeToggle() {
  const [theme, setTheme] = usePersistentState("theme", "light", {
    namespace: "app",
  });

  return (
    <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
      Тема: {theme}
    </button>
  );
}
```

### 4. `feature-flags.jsx`

Фича-флаги из локального объекта или удаленного JSON.

```json
// public/config/feature-flags.json
{
  "flags": {
    "newCheckout": true,
    "payments.applePay": false
  }
}
```

```jsx
import { FeatureGate, useFeatureFlag } from "./modules/feature-flags";

function Checkout() {
  const applePay = useFeatureFlag("payments.applePay", false);

  return (
    <FeatureGate flag="newCheckout" fallback={<OldCheckout />}>
      <NewCheckout showApplePay={applePay} />
    </FeatureGate>
  );
}
```

Локальный override в консоли браузера:

```js
import { setFlagOverride } from "./modules/feature-flags";
setFlagOverride("newCheckout", false);
```

### 5. `error-reporter.jsx`

React Error Boundary, глобальные обработчики ошибок и репортер в HTTP endpoint или Sentry.

```jsx
import {
  ErrorBoundary,
  ErrorReporterProvider,
  createSentryReporter,
} from "./modules/error-reporter";
import * as Sentry from "@sentry/react";

const reportError = createSentryReporter(Sentry);

export function Root() {
  return (
    <ErrorReporterProvider reportError={reportError}>
      <ErrorBoundary fallback={<div>Что-то сломалось. Обновите страницу.</div>}>
        <App />
      </ErrorBoundary>
    </ErrorReporterProvider>
  );
}
```

Если Sentry не нужен, используйте `createHttpErrorReporter({ endpoint: "/api/client-errors" })`.

### 6. `geo-weather.jsx`

Виджет и hook для погоды через Open-Meteo. API не требует ключа для прототипов и некоммерческого использования.

```jsx
import { GeoWeatherBadge, useGeoWeather } from "./modules/geo-weather";

function Header() {
  return (
    <GeoWeatherBadge
      fallbackCoords={{ latitude: 55.7558, longitude: 37.6173 }}
      autoLocate
    />
  );
}

function CustomWeather() {
  const weather = useGeoWeather({
    latitude: 59.9343,
    longitude: 30.3351,
  });

  return <pre>{JSON.stringify(weather.data, null, 2)}</pre>;
}
```

### 7. `feedback-widget.jsx`

Готовая форма обратной связи. Работает с вашим backend endpoint, Formspree, Web3Forms или любым JSON POST API.

```jsx
import { FeedbackWidget, createFormspreeEndpoint } from "./modules/feedback-widget";

function App() {
  return (
    <>
      <Routes />
      <FeedbackWidget
        endpoint={createFormspreeEndpoint("your-form-id")}
        project="my-react-app"
      />
    </>
  );
}
```

### 8. `performance-monitor.js`

Легкий мониторинг Web Vitals-похожих метрик через браузерный `PerformanceObserver`.

```jsx
import { usePerformanceMonitor } from "./modules/performance-monitor";
import { useAnalytics } from "./modules/analytics-kit";

function PerformanceReporter() {
  const analytics = useAnalytics();

  usePerformanceMonitor((metric) => {
    analytics.track("performance_metric", metric);
  });

  return null;
}
```

Добавьте `<PerformanceReporter />` один раз рядом с корневым компонентом.

## Внешние сервисы и важные ссылки

- Open-Meteo Forecast API: https://open-meteo.com/en/docs
- Open-Meteo pricing/free tier notes: https://open-meteo.com/en/pricing
- Formspree HTML/JS endpoints: https://help.formspree.io/articles/building-your-form/building-an-html-form/
- Formspree React library: https://help.formspree.io/articles/working-with-react/the-formspree-react-library/
- Google Analytics 4 events: https://developers.google.com/analytics/devguides/collection/ga4/events
- Plausible custom events: https://plausible.io/docs/custom-event-goals
- Umami event tracking: https://umami.is/docs/track-events
- Sentry React ErrorBoundary: https://docs.sentry.io/platforms/javascript/guides/react/features/error-boundary/

## Безопасность

- Не храните приватные API keys в клиентском React-коде.
- Для Sentry/Formspree/Web3Forms используйте публичные client-side идентификаторы, которые рассчитаны на работу в браузере.
- Для платежей, приватных CRM, email-рассылок и admin API делайте proxy через свой backend.
- В `performance-monitor` не отправляйте персональные данные в `metric.extra`.
