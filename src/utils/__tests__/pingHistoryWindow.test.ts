import { describe, expect, it } from "vitest";
import {
  HISTORY_HOUR_MS,
  MIN_PING_WINDOW_MS,
  clampPingWindow,
  latestPingWindow,
  panPingWindow,
  pingHistoryDomain,
  pingWindowContains,
  pingWindowParams,
  resizePingWindow,
  zoomPingWindow,
} from "@/utils/pingHistoryWindow";

const endMs = Date.parse("2026-10-10T12:00:00Z");
const domain = pingHistoryDomain(endMs);

describe("Ping history navigation", () => {
  it("defaults to the latest day within a 90 day domain", () => {
    expect(domain.endMs - domain.startMs).toBe(90 * 24 * HISTORY_HOUR_MS);
    expect(latestPingWindow(domain)).toEqual({ startMs: endMs - 24 * HISTORY_HOUR_MS, endMs });
  });

  it.each([undefined, 0, -1, Number.NaN, Number.POSITIVE_INFINITY, 365 * 24])("caps an invalid or excessive retention (%s)", (hours) => {
    expect(pingHistoryDomain(endMs, hours)).toEqual(domain);
  });

  it("respects short retention, including a domain smaller than the minimum zoom", () => {
    const short = pingHistoryDomain(endMs, 12);
    expect(latestPingWindow(short)).toEqual(short);
    const tiny = pingHistoryDomain(endMs, 1 / 60);
    expect(latestPingWindow(tiny)).toEqual(tiny);
  });

  it("pans without changing duration or crossing either boundary", () => {
    const window = latestPingWindow(domain);
    expect(panPingWindow(window, HISTORY_HOUR_MS, domain)).toEqual(window);
    expect(panPingWindow(window, -200 * 24 * HISTORY_HOUR_MS, domain)).toEqual({
      startMs: domain.startMs, endMs: domain.startMs + 24 * HISTORY_HOUR_MS,
    });
    expect(panPingWindow(window, -HISTORY_HOUR_MS, domain)).toEqual({
      startMs: window.startMs - HISTORY_HOUR_MS, endMs: window.endMs - HISTORY_HOUR_MS,
    });
  });

  it("zooms around the pointer position and stops at minimum and maximum spans", () => {
    const window = latestPingWindow(domain);
    const zoomed = zoomPingWindow(window, 0.5, 0.25, domain);
    expect(zoomed.startMs).toBe(window.startMs + 3 * HISTORY_HOUR_MS);
    expect(zoomed.endMs - zoomed.startMs).toBe(12 * HISTORY_HOUR_MS);
    const minimum = zoomPingWindow(window, 0.000001, 0.5, domain);
    expect(minimum.endMs - minimum.startMs).toBe(MIN_PING_WINDOW_MS);
    expect(zoomPingWindow(window, 1000, 0.5, domain)).toEqual(domain);
  });

  it("resizes only the selected handle and prevents crossing", () => {
    const window = latestPingWindow(domain);
    expect(resizePingWindow(window, "start", 100 * HISTORY_HOUR_MS, domain)).toEqual({
      startMs: endMs - MIN_PING_WINDOW_MS, endMs,
    });
    expect(resizePingWindow(window, "end", -100 * HISTORY_HOUR_MS, domain)).toEqual({
      startMs: window.startMs, endMs: window.startMs + MIN_PING_WINDOW_MS,
    });
    expect(resizePingWindow(window, "start", -10000 * HISTORY_HOUR_MS, domain).startMs).toBe(domain.startMs);
    expect(resizePingWindow(window, "end", HISTORY_HOUR_MS, domain).endMs).toBe(endMs);
  });

  it("clamps both ends when the server retention changes", () => {
    expect(clampPingWindow(domain, pingHistoryDomain(endMs, 24))).toEqual(latestPingWindow(domain));
  });

  it("serializes absolute windows with a timezone and rejects invalid input", () => {
    expect(pingWindowParams(latestPingWindow(domain))).toEqual({
      start: "2026-10-09T12:00:00.000Z", end: "2026-10-10T12:00:00.000Z",
    });
    expect(() => pingWindowParams({ startMs: endMs, endMs })).toThrow(RangeError);
    expect(() => pingWindowParams({ startMs: Number.NaN, endMs })).toThrow(RangeError);
  });

  it("accepts ISO, epoch seconds and milliseconds when clipping records", () => {
    const window = latestPingWindow(domain);
    expect(pingWindowContains(window, endMs)).toBe(true);
    expect(pingWindowContains(window, endMs / 1000)).toBe(true);
    expect(pingWindowContains(window, new Date(endMs).toISOString())).toBe(true);
    expect(pingWindowContains(window, domain.startMs)).toBe(false);
    expect(pingWindowContains(window, "invalid")).toBe(false);
  });
});
