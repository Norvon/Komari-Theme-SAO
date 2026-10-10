import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { HttpRequestError } from "@/services/requestErrors";
import { latestPingWindow, pingHistoryDomain } from "@/utils/pingHistoryWindow";
import type { ComponentProps } from "react";
import type UplotReact from "uplot-react";

const { recordsMock, statsMock, tasksMock, chartMock } = vi.hoisted(() => ({
  recordsMock: vi.fn(), statsMock: vi.fn(), tasksMock: vi.fn(), chartMock: vi.fn(),
}));

vi.mock("@/hooks/useRecords", () => ({
  usePingRecords: recordsMock, usePingRecordStats: statsMock, usePublicPingTasks: tasksMock,
}));
vi.mock("@/hooks/usePreferences", () => ({
  usePreferences: () => ({ resolvedAppearance: "dark" }),
}));
vi.mock("uplot-react", () => ({ default: chartMock }));
vi.mock("@/components/instance/chartShared", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/components/instance/chartShared")>(),
  useResponsiveChartSize: () => ({ w: 800, h: 300, ref: { current: null } }),
}));

import { PingChart } from "@/components/instance/PingChart";

const task = {
  id: 7, name: "任务 #7", interval: 60, clients: ["node-a"],
  loss: 0, type: "icmp", target: "", weight: 7,
};
const data = {
  count: 1, tasks: [task], records: [{
    task_id: 7, client: "node-a", time: "2026-10-10T00:30:00Z", value: 20,
  }],
};

describe("Ping progressive rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    chartMock.mockImplementation(() => <div data-chart="ready" />);
    recordsMock.mockReturnValue({ data, isError: false, isLoading: false, isFetching: false, refetch: vi.fn() });
    statsMock.mockReturnValue({ data: undefined, isFetching: true, refetch: vi.fn() });
    tasksMock.mockReturnValue({ data: undefined, isFetching: true, refetch: vi.fn() });
  });

  it("renders the ready curve while stats and names are pending or failed", () => {
    const pending = renderToStaticMarkup(<PingChart uuid="node-a" hours={1} />);
    expect(pending).toContain('data-chart="ready"');
    expect(pending).toContain("任务 #7");
    expect(pending).not.toContain("加载中");

    statsMock.mockReturnValue({ data: undefined, isError: true, refetch: vi.fn() });
    tasksMock.mockReturnValue({ data: undefined, isError: true, refetch: vi.fn() });
    expect(renderToStaticMarkup(<PingChart uuid="node-a" hours={1} />)).toContain('data-chart="ready"');
  });

  it("enriches only observed tasks when the public names arrive", () => {
    tasksMock.mockReturnValue({ data: [
      { ...task, name: "真实任务名" }, { ...task, id: 99, name: "其他线路" },
    ], refetch: vi.fn() });

    const markup = renderToStaticMarkup(<PingChart uuid="node-a" hours={1} />);

    expect(markup).toContain("真实任务名");
    expect(markup).not.toContain("其他线路");
  });

  it("shows a login prompt for denied curve requests", () => {
    recordsMock.mockReturnValue({
      data: undefined, isError: true, isLoading: false, isFetching: false,
      error: new HttpRequestError("denied", 401, "/api/rpc2"), refetch: vi.fn(),
    });

    expect(renderToStaticMarkup(<PingChart uuid="node-a" hours={1} />)).toContain("重新登录");
  });

  it("keeps an existing curve when refreshing the same range fails", () => {
    recordsMock.mockReturnValue({
      data, isError: true, isLoading: false, isFetching: false,
      error: new DOMException("expired", "TimeoutError"), refetch: vi.fn(),
    });

    const markup = renderToStaticMarkup(<PingChart uuid="node-a" hours={1} />);

    expect(markup).toContain('data-chart="ready"');
    expect(markup).toContain("刷新失败，重试");
  });

  it("keeps navigation available during initial loading, errors and empty windows", () => {
    const domain = pingHistoryDomain(Date.parse("2026-10-10T01:00:00Z"));
    const range = latestPingWindow(domain);
    const navigation = { domain, window: range, pending: false, onChange: vi.fn(), onLatest: vi.fn() };
    for (const result of [
      { isLoading: true },
      { isError: true, error: new Error("offline") },
      { data: { count: 0, records: [], tasks: [], rangeStartMs: range.startMs, rangeEndMs: range.endMs } },
    ]) {
      recordsMock.mockReturnValue({ isLoading: false, isError: false, isFetching: false, refetch: vi.fn(), ...result });
      const markup = renderToStaticMarkup(<PingChart uuid="node-a" hours={24} range={range} navigation={navigation} />);
      expect(markup).toContain("回到最近 1 天");
      expect(markup).toContain('aria-label="Ping 开始时间"');
      expect(markup).toContain('aria-label="Ping 结束时间"');
    }
  });

  it("forwards the selected window and labels retained data while the next window loads", () => {
    const domain = pingHistoryDomain(Date.parse("2026-10-10T01:00:00Z"));
    const range = latestPingWindow(domain);
    const navigation = { domain, window: range, pending: true, onChange: vi.fn(), onLatest: vi.fn() };
    recordsMock.mockReturnValue({ data, isPlaceholderData: true, isFetching: true, refetch: vi.fn() });
    const markup = renderToStaticMarkup(<PingChart uuid="node-a" hours={24} range={range} navigation={navigation} />);
    expect(recordsMock).toHaveBeenCalledWith("node-a", 24, true, range);
    expect(statsMock).toHaveBeenCalledWith("node-a", 24, true, range);
    expect(markup).toContain("线路统计暂为上次结果");
    expect(markup).toContain('data-chart="ready"');
  });

  it.each([60, 300, 900, 3600])("preserves a missing %i-second bucket with gap connection off", (intervalSeconds) => {
    const start = Date.parse("2026-10-10T00:00:00Z");
    recordsMock.mockReturnValue({ data: {
      ...data, intervalSeconds, records: [
        { ...data.records[0], time: new Date(start).toISOString() },
        { ...data.records[0], time: new Date(start + intervalSeconds * 2000).toISOString() },
      ],
    }, refetch: vi.fn() });

    const markup = renderToStaticMarkup(<PingChart uuid="node-a" hours={24} />);
    const props = chartMock.mock.calls[0][0] as ComponentProps<typeof UplotReact>;

    expect(props.options.series[1].spanGaps).toBe(false);
    expect(props.data[0]).toEqual([start / 1000, start / 1000 + intervalSeconds, start / 1000 + intervalSeconds * 2]);
    expect(props.data[1]).toEqual([20, null, 20]);
    expect(markup).toContain("曲线空白表示缺采样或丢包");
    expect(markup).not.toContain("小空缺始终自动桥接");
  });

  it("keeps normal aggregate buckets connected without mistaking the task interval for the bucket interval", () => {
    recordsMock.mockReturnValue({ data: {
      ...data, intervalSeconds: 900, records: [
        { ...data.records[0], time: "2026-10-10T00:00:00Z" },
        { ...data.records[0], time: "2026-10-10T00:15:00Z" },
        { ...data.records[0], time: "2026-10-10T00:30:00Z" },
      ],
    }, refetch: vi.fn() });

    renderToStaticMarkup(<PingChart uuid="node-a" hours={24} />);
    const props = chartMock.mock.calls[0][0] as ComponentProps<typeof UplotReact>;

    expect(props.options.series[1].spanGaps).toBe(false);
    expect(props.data[1]).toEqual([20, 20, 20]);
  });
});
