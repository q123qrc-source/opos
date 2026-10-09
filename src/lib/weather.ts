/**
 * Weather service backed by the free Open-Meteo API (no key), with a deterministic offline fallback.
 * Shared by the Weather Station app, the taskbar widget, the mobile widget and the TV hero.
 */
import { useEffect } from 'react';
import { create } from 'zustand';

export const CITIES = [
  { name: 'San Francisco', lat: 37.77, lon: -122.42 },
  { name: 'New York', lat: 40.71, lon: -74.01 },
  { name: 'London', lat: 51.51, lon: -0.13 },
  { name: 'Tokyo', lat: 35.68, lon: 139.69 },
  { name: 'Sydney', lat: -33.87, lon: 151.21 },
  { name: 'Reykjavík', lat: 64.15, lon: -21.94 },
  { name: 'Dubai', lat: 25.2, lon: 55.27 },
];

const WMO: Record<number, [string, string]> = {
  0: ['Clear sky', '☀️'],
  1: ['Mainly clear', '🌤️'],
  2: ['Partly cloudy', '⛅'],
  3: ['Overcast', '☁️'],
  45: ['Fog', '🌫️'],
  48: ['Rime fog', '🌫️'],
  51: ['Light drizzle', '🌦️'],
  53: ['Drizzle', '🌦️'],
  55: ['Heavy drizzle', '🌧️'],
  61: ['Light rain', '🌦️'],
  63: ['Rain', '🌧️'],
  65: ['Heavy rain', '🌧️'],
  71: ['Light snow', '🌨️'],
  73: ['Snow', '🌨️'],
  75: ['Heavy snow', '❄️'],
  80: ['Rain showers', '🌦️'],
  81: ['Showers', '🌧️'],
  82: ['Violent showers', '⛈️'],
  95: ['Thunderstorm', '⛈️'],
  96: ['Hail storm', '⛈️'],
  99: ['Severe hail', '⛈️'],
};

export const describe = (code: number) => WMO[code] ?? WMO[Math.floor(code / 10) * 10] ?? ['Unknown', '🌡️'];

export interface WeatherData {
  current: { temp: number; feels: number; humidity: number; wind: number; code: number; label: string; emoji: string; isDay: boolean } | null;
  hourly: { time: Date; temp: number; code: number }[];
  daily: { date: Date; min: number; max: number; code: number; rain: number }[];
  updatedAt: number;
  source: 'live' | 'offline';
}

interface WeatherState extends WeatherData {
  cityIndex: number;
  city: string;
  loading: boolean;
  setCity: (i: number) => void;
  refresh: () => Promise<void>;
}

function mock(cityIndex: number): WeatherData {
  const seed = cityIndex * 7 + new Date().getDate();
  const base = [16, 12, 9, 19, 23, 2, 33][cityIndex] ?? 18;
  const codes = [0, 1, 2, 3, 61, 2, 80, 0];
  const now = new Date();
  const code = codes[seed % codes.length];
  const [label, emoji] = describe(code);
  return {
    current: { temp: base + (seed % 5), feels: base + (seed % 5) - 1, humidity: 40 + (seed % 40), wind: 6 + (seed % 18), code, label, emoji, isDay: now.getHours() > 6 && now.getHours() < 19 },
    hourly: Array.from({ length: 24 }, (_, i) => ({
      time: new Date(now.getTime() + i * 3600000),
      temp: Math.round(base + 4 * Math.sin(((now.getHours() + i - 9) / 24) * Math.PI * 2)),
      code: codes[(seed + i) % codes.length],
    })),
    daily: Array.from({ length: 7 }, (_, i) => ({
      date: new Date(now.getTime() + i * 86400000),
      min: base - 4 + ((seed + i) % 3),
      max: base + 3 + ((seed + i * 2) % 5),
      code: codes[(seed + i * 3) % codes.length],
      rain: ((seed + i) * 13) % 80,
    })),
    updatedAt: Date.now(),
    source: 'offline',
  };
}

let inflight: Promise<void> | null = null;

export const useWeatherStore = create<WeatherState>((set, get) => ({
  ...mock(0),
  current: null,
  cityIndex: Number(localStorage.getItem('opos:weather-city') ?? 0) || 0,
  city: CITIES[Number(localStorage.getItem('opos:weather-city') ?? 0) || 0].name,
  loading: false,
  setCity: (i) => {
    localStorage.setItem('opos:weather-city', String(i));
    set({ cityIndex: i, city: CITIES[i].name, current: null });
    void get().refresh();
  },
  refresh: async () => {
    if (inflight) return inflight;
    const { cityIndex } = get();
    const c = CITIES[cityIndex];
    set({ loading: true });
    inflight = (async () => {
      try {
        const url =
          `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}` +
          '&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,is_day' +
          '&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max' +
          '&timezone=auto&forecast_days=7';
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        const res = await fetch(url, { signal: ctrl.signal });
        clearTimeout(timer);
        if (!res.ok) throw new Error(String(res.status));
        const j = await res.json();
        const [label, emoji] = describe(j.current.weather_code);
        const nowIdx = Math.max(0, (j.hourly.time as string[]).findIndex((t) => new Date(t).getTime() >= Date.now() - 3600000));
        set({
          current: {
            temp: j.current.temperature_2m,
            feels: j.current.apparent_temperature,
            humidity: j.current.relative_humidity_2m,
            wind: j.current.wind_speed_10m,
            code: j.current.weather_code,
            label,
            emoji,
            isDay: !!j.current.is_day,
          },
          hourly: (j.hourly.time as string[]).slice(nowIdx, nowIdx + 24).map((t, i) => ({
            time: new Date(t),
            temp: j.hourly.temperature_2m[nowIdx + i],
            code: j.hourly.weather_code[nowIdx + i],
          })),
          daily: (j.daily.time as string[]).map((t, i) => ({
            date: new Date(t),
            min: j.daily.temperature_2m_min[i],
            max: j.daily.temperature_2m_max[i],
            code: j.daily.weather_code[i],
            rain: j.daily.precipitation_probability_max?.[i] ?? 0,
          })),
          updatedAt: Date.now(),
          source: 'live',
        });
      } catch {
        set(mock(cityIndex));
      } finally {
        set({ loading: false });
        inflight = null;
      }
    })();
    return inflight;
  },
}));

export function useWeather() {
  const state = useWeatherStore();
  useEffect(() => {
    const s = useWeatherStore.getState();
    if (!s.current || Date.now() - s.updatedAt > 15 * 60000) void s.refresh();
  }, []);
  return state;
}
