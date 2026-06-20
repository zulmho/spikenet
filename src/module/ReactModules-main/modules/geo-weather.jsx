import React, { useCallback, useEffect, useMemo, useState } from "react";

/*
Инструкция:
1. Скопируйте файл в src/modules/geo-weather.jsx.
2. Используйте <GeoWeatherBadge autoLocate /> или useGeoWeather({ latitude, longitude }).
3. Open-Meteo не требует API key для прототипов; для коммерческого лимита проверьте их pricing.
*/

const FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

const WEATHER_CODES = {
  0: "Clear",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Rime fog",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Heavy drizzle",
  56: "Freezing drizzle",
  57: "Heavy freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Heavy freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Light showers",
  81: "Showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with hail",
  99: "Heavy thunderstorm with hail",
};

function canUseWindow() {
  return typeof window !== "undefined";
}

function hasCoords(coords) {
  return (
    coords &&
    Number.isFinite(Number(coords.latitude)) &&
    Number.isFinite(Number(coords.longitude))
  );
}

function getBrowserCoords(options = {}) {
  return new Promise((resolve, reject) => {
    if (!canUseWindow() || !navigator.geolocation) {
      reject(new Error("Geolocation is not available"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      reject,
      {
        enableHighAccuracy: false,
        timeout: 8000,
        maximumAge: 10 * 60 * 1000,
        ...options,
      }
    );
  });
}

function buildForecastUrl(coords, options = {}) {
  const url = new URL(FORECAST_URL);
  url.searchParams.set("latitude", coords.latitude);
  url.searchParams.set("longitude", coords.longitude);
  url.searchParams.set(
    "current",
    [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "is_day",
      "precipitation",
      "rain",
      "weather_code",
      "wind_speed_10m",
    ].join(",")
  );
  url.searchParams.set("timezone", options.timezone || "auto");

  if (options.temperatureUnit) url.searchParams.set("temperature_unit", options.temperatureUnit);
  if (options.windSpeedUnit) url.searchParams.set("wind_speed_unit", options.windSpeedUnit);
  if (options.precipitationUnit) {
    url.searchParams.set("precipitation_unit", options.precipitationUnit);
  }

  return url.toString();
}

export async function fetchOpenMeteoCurrent(coords, options = {}) {
  if (!hasCoords(coords)) throw new Error("Latitude and longitude are required");

  const response = await fetch(buildForecastUrl(coords, options), {
    signal: options.signal,
  });

  if (!response.ok) throw new Error(`Open-Meteo request failed: ${response.status}`);

  const data = await response.json();
  const current = data.current || {};
  const code = Number(current.weather_code);

  return {
    latitude: data.latitude,
    longitude: data.longitude,
    timezone: data.timezone,
    current,
    units: data.current_units || {},
    summary: WEATHER_CODES[code] || "Unknown",
    weatherCode: code,
    raw: data,
  };
}

export function useGeoWeather(options = {}) {
  const {
    latitude,
    longitude,
    fallbackCoords,
    autoLocate = false,
    enabled = true,
    geolocationOptions,
  } = options;

  const [state, setState] = useState({
    data: null,
    error: null,
    loading: Boolean(enabled),
  });
  const [refreshKey, setRefreshKey] = useState(0);

  const suppliedCoords = useMemo(() => {
    if (hasCoords({ latitude, longitude })) return { latitude, longitude };
    return null;
  }, [latitude, longitude]);

  const reload = useCallback(() => setRefreshKey((current) => current + 1), []);

  useEffect(() => {
    if (!enabled) return undefined;

    const controller = new AbortController();
    let cancelled = false;

    async function loadWeather() {
      setState((current) => ({ ...current, loading: true, error: null }));

      try {
        let coords = suppliedCoords;

        if (!coords && autoLocate) {
          coords = await getBrowserCoords(geolocationOptions).catch(() => null);
        }

        if (!coords && hasCoords(fallbackCoords)) coords = fallbackCoords;
        if (!coords) throw new Error("No coordinates available");

        const data = await fetchOpenMeteoCurrent(coords, {
          ...options,
          signal: controller.signal,
        });

        if (!cancelled) setState({ data, error: null, loading: false });
      } catch (error) {
        if (error.name === "AbortError" || cancelled) return;
        setState((current) => ({ ...current, error, loading: false }));
      }
    }

    loadWeather();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    autoLocate,
    enabled,
    fallbackCoords,
    geolocationOptions,
    options.precipitationUnit,
    options.temperatureUnit,
    options.timezone,
    options.windSpeedUnit,
    refreshKey,
    suppliedCoords,
  ]);

  return { ...state, reload };
}

function formatTemperature(data) {
  const value = data?.current?.temperature_2m;
  const unit = data?.units?.temperature_2m || "C";
  if (value === undefined || value === null) return "--";
  return `${Math.round(value)}${unit}`;
}

export function GeoWeatherBadge({
  latitude,
  longitude,
  fallbackCoords,
  autoLocate = false,
  className,
  style,
  compact = false,
}) {
  const weather = useGeoWeather({
    latitude,
    longitude,
    fallbackCoords,
    autoLocate,
  });

  if (weather.loading) {
    return (
      <span className={className} style={{ ...badgeStyle, ...style }}>
        Weather...
      </span>
    );
  }

  if (weather.error) {
    return (
      <button
        type="button"
        className={className}
        onClick={weather.reload}
        style={{ ...badgeStyle, ...style }}
        title={weather.error.message}
      >
        Weather unavailable
      </button>
    );
  }

  const current = weather.data?.current || {};

  return (
    <button
      type="button"
      className={className}
      onClick={weather.reload}
      style={{ ...badgeStyle, ...style }}
      title="Refresh weather"
    >
      <span>{formatTemperature(weather.data)}</span>
      {!compact && <span style={{ color: "#53606f" }}>{weather.data?.summary}</span>}
      {!compact && current.wind_speed_10m !== undefined && (
        <span style={{ color: "#53606f" }}>
          Wind {Math.round(current.wind_speed_10m)}
          {weather.data?.units?.wind_speed_10m || ""}
        </span>
      )}
    </button>
  );
}

const badgeStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  minHeight: 36,
  padding: "6px 10px",
  border: "1px solid #d7dde5",
  borderRadius: 8,
  background: "#ffffff",
  color: "#18212f",
  font: "500 14px/1.2 system-ui, sans-serif",
  cursor: "pointer",
};

