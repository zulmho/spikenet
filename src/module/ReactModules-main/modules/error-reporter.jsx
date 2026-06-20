import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from "react";

/*
Инструкция:
1. Скопируйте файл в src/modules/error-reporter.jsx.
2. Оберните приложение в <ErrorReporterProvider reportError={...}>.
3. Поставьте <ErrorBoundary> вокруг App или опасных частей интерфейса.
4. reportError можно отправлять в Sentry, свой backend или console.
*/

const ErrorReporterContext = createContext(() => undefined);

function canUseWindow() {
  return typeof window !== "undefined";
}

function normalizeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "NonError",
    message: typeof error === "string" ? error : JSON.stringify(error),
    stack: undefined,
  };
}

function createPayload(error, context, config) {
  return {
    app: config.app,
    release: config.release,
    environment: config.environment,
    error: normalizeError(error),
    context,
    user: config.getUser ? config.getUser() : undefined,
    url: canUseWindow() ? window.location.href : undefined,
    userAgent: canUseWindow() ? window.navigator.userAgent : undefined,
    timestamp: new Date().toISOString(),
  };
}

export function createHttpErrorReporter(config = {}) {
  const {
    endpoint,
    headers = {},
    app = "react-app",
    release,
    environment,
    getUser,
  } = config;

  return async function reportError(error, context = {}) {
    const payload = createPayload(error, context, {
      app,
      release,
      environment,
      getUser,
    });

    if (!endpoint || !canUseWindow()) {
      console.error("[client-error]", payload);
      return;
    }

    const body = JSON.stringify(payload);
    const hasCustomHeaders = Object.keys(headers).length > 0;

    if (!hasCustomHeaders && navigator.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon(endpoint, blob);
      return;
    }

    await fetch(endpoint, {
      method: "POST",
      keepalive: true,
      headers: {
        "content-type": "application/json",
        ...headers,
      },
      body,
    });
  };
}

export function createSentryReporter(Sentry) {
  return function reportToSentry(error, context = {}) {
    if (!Sentry || typeof Sentry.captureException !== "function") {
      console.error("[sentry-missing]", error, context);
      return;
    }

    Sentry.captureException(error, {
      extra: context,
    });
  };
}

export function installGlobalErrorHandlers(reportError, options = {}) {
  if (!canUseWindow()) return () => undefined;

  const handleError = (event) => {
    reportError(event.error || event.message, {
      source: "window.error",
      filename: event.filename,
      lineno: event.lineno,
      colno: event.colno,
    });
  };

  const handleRejection = (event) => {
    reportError(event.reason, {
      source: "window.unhandledrejection",
    });
  };

  window.addEventListener("error", handleError);
  window.addEventListener("unhandledrejection", handleRejection);

  let restoreConsole = () => undefined;
  if (options.captureConsole) {
    const originalError = console.error;
    console.error = (...args) => {
      reportError(args[0], { source: "console.error", args: args.slice(1) });
      originalError.apply(console, args);
    };
    restoreConsole = () => {
      console.error = originalError;
    };
  }

  return () => {
    window.removeEventListener("error", handleError);
    window.removeEventListener("unhandledrejection", handleRejection);
    restoreConsole();
  };
}

export function ErrorReporterProvider({
  reportError = createHttpErrorReporter(),
  installGlobalHandlers = true,
  children,
}) {
  const stableReportError = useCallback(
    (error, context) => reportError(error, context),
    [reportError]
  );

  useEffect(() => {
    if (!installGlobalHandlers) return undefined;
    return installGlobalErrorHandlers(stableReportError);
  }, [installGlobalHandlers, stableReportError]);

  return (
    <ErrorReporterContext.Provider value={stableReportError}>
      {children}
    </ErrorReporterContext.Provider>
  );
}

export function useErrorReporter() {
  return useContext(ErrorReporterContext);
}

function DefaultFallback({ error, reset }) {
  return (
    <div
      role="alert"
      style={{
        padding: 16,
        border: "1px solid #f2c2c2",
        borderRadius: 8,
        background: "#fff6f6",
        color: "#5b1f1f",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <strong>Something went wrong.</strong>
      <div style={{ marginTop: 8, fontSize: 14 }}>{error?.message || "Unknown error"}</div>
      <button type="button" onClick={reset} style={{ marginTop: 12 }}>
        Try again
      </button>
    </div>
  );
}

function areResetKeysChanged(prev = [], next = []) {
  if (prev.length !== next.length) return true;
  return prev.some((item, index) => item !== next[index]);
}

export class ErrorBoundary extends React.Component {
  static contextType = ErrorReporterContext;

  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
    this.reset = this.reset.bind(this);
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    const reportError = this.props.reportError || this.context;
    if (reportError) {
      reportError(error, {
        source: "react.error-boundary",
        componentStack: info.componentStack,
        boundary: this.props.name,
      });
    }
  }

  componentDidUpdate(prevProps) {
    if (
      this.state.hasError &&
      areResetKeysChanged(prevProps.resetKeys, this.props.resetKeys)
    ) {
      this.reset();
    }
  }

  reset() {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) this.props.onReset();
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    if (typeof this.props.fallback === "function") {
      return this.props.fallback({
        error: this.state.error,
        reset: this.reset,
      });
    }

    if (this.props.fallback) return this.props.fallback;

    return <DefaultFallback error={this.state.error} reset={this.reset} />;
  }
}

export function useReportAsyncError() {
  const reportError = useErrorReporter();

  return useMemo(
    () => async (promise, context = {}) => {
      try {
        return await promise;
      } catch (error) {
        reportError(error, { source: "async", ...context });
        throw error;
      }
    },
    [reportError]
  );
}

