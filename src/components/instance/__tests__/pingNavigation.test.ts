import { describe, expect, it, vi } from "vitest";
import type uPlot from "uplot";
import { pingNavigationPlugin, type PingChartNavigation } from "../pingNavigation";
import { HISTORY_HOUR_MS, latestPingWindow, pingHistoryDomain } from "@/utils/pingHistoryWindow";

function harness() {
  const overlay = new EventTarget() as EventTarget & {
    style: Record<string, string>;
    getBoundingClientRect: () => { left: number; width: number };
    setPointerCapture: ReturnType<typeof vi.fn>;
    hasPointerCapture: () => boolean;
    releasePointerCapture: ReturnType<typeof vi.fn>;
  };
  overlay.style = {};
  overlay.getBoundingClientRect = () => ({ left: 0, width: 100 });
  overlay.setPointerCapture = vi.fn();
  overlay.hasPointerCapture = () => true;
  overlay.releasePointerCapture = vi.fn();
  const domain = pingHistoryDomain(Date.parse("2026-10-10T12:00:00Z"));
  const navigation: PingChartNavigation = {
    domain, window: latestPingWindow(domain), pending: false,
    onChange: vi.fn((window) => { navigation.window = window; }), onLatest: vi.fn(), onDragging: vi.fn(),
  };
  const plugin = pingNavigationPlugin(() => navigation);
  const plot = { over: overlay } as unknown as uPlot;
  (plugin.hooks!.ready as Array<(plot: uPlot) => void>)[0](plot);
  const emit = (type: string, properties: Record<string, number> = {}) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, { button: 0, pointerId: 1, clientX: 50, ...properties });
    overlay.dispatchEvent(event);
    return event;
  };
  return { navigation, overlay, plugin, plot, emit };
}

describe("uPlot Ping navigation plugin", () => {
  it("pans against the original pointer position without cumulative drift", () => {
    const { navigation, overlay, emit } = harness();
    const initial = navigation.window;
    emit("pointerdown");
    emit("pointermove", { clientX: 75 });
    emit("pointerup", { clientX: 100 });
    expect(navigation.window.startMs).toBe(initial.startMs - 12 * HISTORY_HOUR_MS);
    expect(navigation.window.endMs - navigation.window.startMs).toBe(24 * HISTORY_HOUR_MS);
    expect(overlay.releasePointerCapture).toHaveBeenCalledWith(1);
    expect(navigation.onDragging).toHaveBeenNthCalledWith(1, true);
    expect(navigation.onDragging).toHaveBeenNthCalledWith(2, false);
  });

  it("ignores unrelated pointers and restores the window when a gesture is cancelled", () => {
    const { navigation, emit } = harness();
    const initial = navigation.window;
    emit("pointerdown");
    emit("pointermove", { pointerId: 2, clientX: 100 });
    expect(navigation.onChange).not.toHaveBeenCalled();
    emit("pointermove", { clientX: 100 });
    emit("pointercancel");
    expect(navigation.window).toEqual(initial);
  });

  it("zooms only the displayed time window and resets on double click", () => {
    const { navigation, emit } = harness();
    expect(emit("wheel", { deltaY: -100 }).defaultPrevented).toBe(true);
    expect(navigation.window.endMs - navigation.window.startMs).toBeLessThan(24 * HISTORY_HOUR_MS);
    emit("dblclick");
    expect(navigation.onLatest).toHaveBeenCalledTimes(1);
  });

  it("cleans up listeners and pointer capture when the chart is recreated", () => {
    const { navigation, overlay, emit, plugin, plot } = harness();
    emit("pointerdown");
    (plugin.hooks!.destroy as Array<(plot: uPlot) => void>)[0](plot);
    emit("pointermove", { clientX: 100 });
    emit("wheel", { deltaY: 100 });
    emit("dblclick");
    expect(navigation.onChange).not.toHaveBeenCalled();
    expect(navigation.onLatest).not.toHaveBeenCalled();
    expect(overlay.releasePointerCapture).toHaveBeenCalledWith(1);
  });

  it("unblocks loading when pointer capture is unexpectedly lost", () => {
    const { navigation, emit } = harness();
    emit("pointerdown");
    emit("pointermove", { clientX: 100 });
    emit("lostpointercapture");
    const lastWindow = navigation.window;
    emit("pointermove", { clientX: 150 });
    expect(navigation.window).toEqual(lastWindow);
    expect(navigation.onDragging).toHaveBeenLastCalledWith(false);
  });
});
