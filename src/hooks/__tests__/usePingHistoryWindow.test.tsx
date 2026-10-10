import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { usePingHistoryWindow } from "@/hooks/usePingHistoryWindow";
import { HISTORY_HOUR_MS } from "@/utils/pingHistoryWindow";

function initialNavigation(maxHours: number) {
  const result: { current?: ReturnType<typeof usePingHistoryWindow> } = {};
  function Probe() {
    result.current = usePingHistoryWindow("node-a", maxHours);
    return null;
  }
  renderToStaticMarkup(<Probe />);
  if (!result.current) throw new Error("Missing history navigation");
  return result.current;
}

describe("Ping window initialization", () => {
  afterEach(() => vi.restoreAllMocks());

  it("requests the latest day immediately rather than the full 90 day domain", () => {
    const now = Date.parse("2026-10-10T12:00:00Z");
    vi.spyOn(Date, "now").mockReturnValue(now);
    const navigation = initialNavigation(2160);
    expect(navigation.window).toEqual({ startMs: now - 24 * HISTORY_HOUR_MS, endMs: now });
    expect(navigation.queryWindow).toEqual(navigation.window);
    expect(navigation.queryHours).toBe(24);
    expect(navigation.selectedHours).toBe(24);
    expect(navigation.pending).toBe(false);
  });

  it("uses the entire available range when fewer than 24 hours are retained", () => {
    const navigation = initialNavigation(12);
    expect(navigation.window).toEqual(navigation.domain);
    expect(navigation.queryHours).toBe(12);
    expect(navigation.selectedHours).toBe(12);
  });

  it("never exposes more than 90 days even with longer server retention", () => {
    const navigation = initialNavigation(365 * 24);
    expect(navigation.domain.endMs - navigation.domain.startMs).toBe(90 * 24 * HISTORY_HOUR_MS);
  });
});
