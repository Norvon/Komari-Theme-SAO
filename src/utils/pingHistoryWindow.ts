export interface PingHistoryWindow {
  startMs: number;
  endMs: number;
}

export const HISTORY_HOUR_MS = 3_600_000;
export const DEFAULT_PING_HOURS = 24;
export const MAX_PING_HOURS = 90 * 24;
export const MIN_PING_WINDOW_MS = 5 * 60_000;

export function pingHistoryDomain(endMs: number, maxHours = MAX_PING_HOURS): PingHistoryWindow {
  const hours = Number.isFinite(maxHours) && maxHours > 0
    ? Math.min(maxHours, MAX_PING_HOURS)
    : MAX_PING_HOURS;
  return { startMs: endMs - hours * HISTORY_HOUR_MS, endMs };
}

export function clampPingWindow(window: PingHistoryWindow, domain: PingHistoryWindow): PingHistoryWindow {
  const capacity = domain.endMs - domain.startMs;
  const minimum = Math.min(MIN_PING_WINDOW_MS, capacity);
  const duration = Math.min(capacity, Math.max(minimum, window.endMs - window.startMs));
  const startMs = Math.max(domain.startMs, Math.min(window.startMs, domain.endMs - duration));
  return { startMs: Math.round(startMs), endMs: Math.round(startMs + duration) };
}

export function latestPingWindow(domain: PingHistoryWindow, hours = DEFAULT_PING_HOURS) {
  return clampPingWindow({ startMs: domain.endMs - hours * HISTORY_HOUR_MS, endMs: domain.endMs }, domain);
}

export function panPingWindow(window: PingHistoryWindow, deltaMs: number, domain: PingHistoryWindow) {
  return clampPingWindow({ startMs: window.startMs + deltaMs, endMs: window.endMs + deltaMs }, domain);
}

export function zoomPingWindow(window: PingHistoryWindow, factor: number, position: number, domain: PingHistoryWindow) {
  const ratio = Math.max(0, Math.min(1, position));
  const duration = window.endMs - window.startMs;
  const nextDuration = Math.min(domain.endMs - domain.startMs, Math.max(MIN_PING_WINDOW_MS, duration * factor));
  const startMs = window.startMs + duration * ratio - nextDuration * ratio;
  return clampPingWindow({ startMs, endMs: startMs + nextDuration }, domain);
}

export function resizePingWindow(window: PingHistoryWindow, edge: "start" | "end", deltaMs: number, domain: PingHistoryWindow) {
  const minimum = Math.min(MIN_PING_WINDOW_MS, domain.endMs - domain.startMs);
  return edge === "start"
    ? { startMs: Math.round(Math.max(domain.startMs, Math.min(window.startMs + deltaMs, window.endMs - minimum))), endMs: window.endMs }
    : { startMs: window.startMs, endMs: Math.round(Math.min(domain.endMs, Math.max(window.endMs + deltaMs, window.startMs + minimum))) };
}

export function samePingWindow(left: PingHistoryWindow, right: PingHistoryWindow) {
  return left.startMs === right.startMs && left.endMs === right.endMs;
}

export function pingWindowParams(window?: PingHistoryWindow) {
  if (!window) return {};
  if (!Number.isFinite(window.startMs) || !Number.isFinite(window.endMs) || window.endMs <= window.startMs) {
    throw new RangeError("Invalid Ping history window");
  }
  return { start: new Date(window.startMs).toISOString(), end: new Date(window.endMs).toISOString() };
}

export function pingWindowContains(window: PingHistoryWindow, time: string | number) {
  const timestamp = typeof time === "number" ? time > 1_000_000_000_000 ? time : time * 1000 : Date.parse(time);
  return timestamp >= window.startMs && timestamp <= window.endMs;
}

export function formatPingWindowTime(timeMs: number) {
  return new Date(timeMs).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
}
