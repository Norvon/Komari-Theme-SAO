import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PingTimeNavigator } from "../PingTimeNavigator";
import {
  HISTORY_HOUR_MS,
  formatPingWindowTime,
  latestPingWindow,
  panPingWindow,
  pingHistoryDomain,
  resizePingWindow,
} from "@/utils/pingHistoryWindow";
import type { PingChartNavigation } from "../pingNavigation";

const domain = pingHistoryDomain(Date.parse("2026-10-10T12:00:00Z"));

function render(window = latestPingWindow(domain), pending = false) {
  const navigation: PingChartNavigation = {
    domain, window, pending, onChange: vi.fn(), onLatest: vi.fn(),
  };
  return renderToStaticMarkup(<PingTimeNavigator navigation={navigation} />);
}

function boundary(markup: string, edge: "start" | "end") {
  const match = markup.match(new RegExp(`<div class="instance-ping-time-boundary is-${edge}"[^>]*>(.*?)</div>`));
  if (!match) throw new Error(`Missing ${edge} time label`);
  return match[1];
}

describe("Ping time boundary labels", () => {
  it("labels both handles with the selected date and time", () => {
    const window = latestPingWindow(domain);
    const markup = render(window);
    expect(boundary(markup, "start")).toContain("开始");
    expect(boundary(markup, "start")).toContain(formatPingWindowTime(window.startMs));
    expect(boundary(markup, "start")).toContain(new Date(window.startMs).toISOString());
    expect(boundary(markup, "end")).toContain("结束");
    expect(boundary(markup, "end")).toContain(formatPingWindowTime(window.endMs));
    expect(boundary(markup, "end")).toContain(new Date(window.endMs).toISOString());
  });

  it("updates both labels when panning and only the changed edge when resizing", () => {
    const initial = latestPingWindow(domain);
    const panned = panPingWindow(initial, -HISTORY_HOUR_MS, domain);
    const resized = resizePingWindow(panned, "start", HISTORY_HOUR_MS, domain);
    const pannedMarkup = render(panned);
    const resizedMarkup = render(resized);
    expect(boundary(pannedMarkup, "start")).toContain(formatPingWindowTime(panned.startMs));
    expect(boundary(pannedMarkup, "end")).toContain(formatPingWindowTime(panned.endMs));
    expect(boundary(resizedMarkup, "start")).not.toBe(boundary(pannedMarkup, "start"));
    expect(boundary(resizedMarkup, "end")).toBe(boundary(pannedMarkup, "end"));
  });

  it("keeps draft times visible before the selected window is queried", () => {
    const window = panPingWindow(latestPingWindow(domain), -HISTORY_HOUR_MS, domain);
    const markup = render(window, true);
    expect(markup).toContain('class="instance-ping-time-rail is-changing"');
    expect(boundary(markup, "start")).toContain(formatPingWindowTime(window.startMs));
    expect(boundary(markup, "end")).toContain(formatPingWindowTime(window.endMs));
  });
});
