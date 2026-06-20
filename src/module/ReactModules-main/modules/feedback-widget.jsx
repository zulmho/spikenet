import React, { useCallback, useMemo, useState } from "react";

/*
Инструкция:
1. Скопируйте файл в src/modules/feedback-widget.jsx.
2. Вставьте <FeedbackWidget endpoint="/api/feedback" /> рядом с App.
3. Для Formspree используйте createFormspreeEndpoint("form-id").
*/

export function createFormspreeEndpoint(formId) {
  return `https://formspree.io/f/${formId}`;
}

export async function submitFeedback({
  endpoint,
  payload,
  headers = {},
  signal,
  transformPayload,
}) {
  if (!endpoint) throw new Error("Feedback endpoint is required");

  const body = transformPayload ? transformPayload(payload) : payload;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Feedback request failed: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

export function useFeedbackForm(options = {}) {
  const {
    endpoint,
    project,
    extraPayload,
    headers,
    transformPayload,
    onSuccess,
    onError,
  } = options;

  const [values, setValues] = useState({
    email: "",
    message: "",
    rating: "",
  });
  const [status, setStatus] = useState({
    loading: false,
    error: null,
    success: false,
  });

  const setField = useCallback((name, value) => {
    setValues((current) => ({ ...current, [name]: value }));
  }, []);

  const reset = useCallback(() => {
    setValues({ email: "", message: "", rating: "" });
    setStatus({ loading: false, error: null, success: false });
  }, []);

  const submit = useCallback(
    async (event) => {
      if (event?.preventDefault) event.preventDefault();

      setStatus({ loading: true, error: null, success: false });

      try {
        const payload = {
          ...values,
          project,
          page: typeof window !== "undefined" ? window.location.href : undefined,
          userAgent: typeof navigator !== "undefined" ? navigator.userAgent : undefined,
          createdAt: new Date().toISOString(),
          ...(typeof extraPayload === "function" ? extraPayload(values) : extraPayload),
        };

        const result = await submitFeedback({
          endpoint,
          payload,
          headers,
          transformPayload,
        });

        setStatus({ loading: false, error: null, success: true });
        setValues((current) => ({ ...current, message: "", rating: "" }));
        if (onSuccess) onSuccess(result);
        return result;
      } catch (error) {
        setStatus({ loading: false, error, success: false });
        if (onError) onError(error);
        return null;
      }
    },
    [endpoint, extraPayload, headers, onError, onSuccess, project, transformPayload, values]
  );

  return {
    values,
    status,
    setField,
    setValues,
    submit,
    reset,
  };
}

export function FeedbackForm({
  endpoint,
  project,
  title = "Feedback",
  description = "Send a quick note to the team.",
  submitLabel = "Send",
  successLabel = "Thanks. Feedback sent.",
  extraPayload,
  onSuccess,
  onError,
}) {
  const form = useFeedbackForm({
    endpoint,
    project,
    extraPayload,
    onSuccess,
    onError,
  });

  return (
    <form onSubmit={form.submit} style={formStyle}>
      <div>
        <div style={titleStyle}>{title}</div>
        {description && <div style={descriptionStyle}>{description}</div>}
      </div>

      <label style={labelStyle}>
        Email
        <input
          type="email"
          value={form.values.email}
          onChange={(event) => form.setField("email", event.target.value)}
          placeholder="name@example.com"
          style={inputStyle}
        />
      </label>

      <label style={labelStyle}>
        Rating
        <select
          value={form.values.rating}
          onChange={(event) => form.setField("rating", event.target.value)}
          style={inputStyle}
        >
          <option value="">No rating</option>
          <option value="5">5 - Excellent</option>
          <option value="4">4 - Good</option>
          <option value="3">3 - Okay</option>
          <option value="2">2 - Bad</option>
          <option value="1">1 - Very bad</option>
        </select>
      </label>

      <label style={labelStyle}>
        Message
        <textarea
          required
          value={form.values.message}
          onChange={(event) => form.setField("message", event.target.value)}
          placeholder="What should we improve?"
          rows={4}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </label>

      {form.status.error && <div style={errorStyle}>{form.status.error.message}</div>}
      {form.status.success && <div style={successStyle}>{successLabel}</div>}

      <button type="submit" disabled={form.status.loading} style={buttonStyle}>
        {form.status.loading ? "Sending..." : submitLabel}
      </button>
    </form>
  );
}

export function FeedbackWidget({
  endpoint,
  project,
  position = "bottom-right",
  buttonLabel = "Feedback",
  title,
  description,
  extraPayload,
}) {
  const [open, setOpen] = useState(false);

  const positionStyle = useMemo(() => {
    const vertical = position.includes("top") ? { top: 20 } : { bottom: 20 };
    const horizontal = position.includes("left") ? { left: 20 } : { right: 20 };
    return { ...vertical, ...horizontal };
  }, [position]);

  return (
    <div style={{ ...widgetStyle, ...positionStyle }}>
      {open && (
        <div style={panelStyle}>
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close feedback"
            style={closeButtonStyle}
          >
            x
          </button>
          <FeedbackForm
            endpoint={endpoint}
            project={project}
            title={title}
            description={description}
            extraPayload={extraPayload}
            onSuccess={() => window.setTimeout(() => setOpen(false), 900)}
          />
        </div>
      )}

      {!open && (
        <button type="button" onClick={() => setOpen(true)} style={floatingButtonStyle}>
          {buttonLabel}
        </button>
      )}
    </div>
  );
}

const widgetStyle = {
  position: "fixed",
  zIndex: 1000,
  fontFamily: "system-ui, sans-serif",
};

const panelStyle = {
  position: "relative",
  width: "min(360px, calc(100vw - 32px))",
  padding: 16,
  border: "1px solid #d8dee8",
  borderRadius: 8,
  background: "#ffffff",
  boxShadow: "0 14px 40px rgba(16, 24, 40, 0.18)",
};

const closeButtonStyle = {
  position: "absolute",
  top: 8,
  right: 8,
  width: 28,
  height: 28,
  border: "1px solid #d8dee8",
  borderRadius: 6,
  background: "#ffffff",
  cursor: "pointer",
};

const floatingButtonStyle = {
  minHeight: 40,
  padding: "0 14px",
  border: 0,
  borderRadius: 8,
  background: "#18212f",
  color: "#ffffff",
  fontWeight: 700,
  cursor: "pointer",
  boxShadow: "0 8px 26px rgba(16, 24, 40, 0.2)",
};

const formStyle = {
  display: "grid",
  gap: 12,
};

const titleStyle = {
  fontSize: 18,
  fontWeight: 750,
  color: "#18212f",
};

const descriptionStyle = {
  marginTop: 4,
  fontSize: 13,
  color: "#53606f",
};

const labelStyle = {
  display: "grid",
  gap: 5,
  fontSize: 13,
  fontWeight: 650,
  color: "#2f3a49",
};

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cfd7e3",
  borderRadius: 7,
  padding: "9px 10px",
  font: "14px system-ui, sans-serif",
};

const buttonStyle = {
  minHeight: 38,
  border: 0,
  borderRadius: 7,
  background: "#2257d6",
  color: "#ffffff",
  fontWeight: 750,
  cursor: "pointer",
};

const errorStyle = {
  padding: 8,
  borderRadius: 7,
  background: "#fff1f1",
  color: "#9f1d1d",
  fontSize: 13,
};

const successStyle = {
  padding: 8,
  borderRadius: 7,
  background: "#ecfdf3",
  color: "#067647",
  fontSize: 13,
};

