import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock, MockRpcResponseError } = vi.hoisted(() => ({
  rpcMock: vi.fn(),
  MockRpcResponseError: class extends Error {
    constructor(message: string, public readonly code?: number) { super(message); }
  },
}));
vi.mock("@/services/rpc2Client", () => ({
  getRpc2Client: () => ({ call: rpcMock }), RpcResponseError: MockRpcResponseError,
}));

const range = { startMs: Date.parse("2026-10-08T04:00:00Z"), endMs: Date.parse("2026-10-08T05:15:00Z") };
const timeParams = { start: "2026-10-08T04:00:00.000Z", end: "2026-10-08T05:15:00.000Z" };
const record = { task_id: 7, client: "node-a", time: "2026-10-08T04:30:00Z", value: 20 };

describe("absolute Ping history requests", () => {
  let api: typeof import("@/services/api");
  beforeEach(async () => {
    vi.resetModules();
    rpcMock.mockReset();
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn());
    api = await import("@/services/api");
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("sends the same absolute range to curves and statistics", async () => {
    rpcMock.mockImplementation((method: string, params: Record<string, unknown>) => {
      if (method === "public:getPingMetricStats") return Promise.resolve({ ...timeParams, stats: [] });
      if (!params.metric_keys) return Promise.resolve({});
      return Promise.resolve({ ...timeParams, series: [{
        metric_key: "ping.latency_ms", entity_id: "node-a", tags: { task_id: "7" }, interval_seconds: 60,
        points: [{ time: record.time, value: 20, count: 1 }, { time: "2026-10-09T00:00:00Z", value: 30, count: 1 }],
      }] });
    });
    const data = await api.getPingRecords("node-a", 1.25, { range, includeStats: false, includeTasks: false });
    await api.getPingStats("node-a", 1.25, { range });
    expect(rpcMock.mock.calls.find(([method, params]) => method === "public:queryMetrics" && params.metric_keys)?.[1]).toMatchObject(timeParams);
    expect(rpcMock.mock.calls.find(([method]) => method === "public:getPingMetricStats")?.[1]).toMatchObject(timeParams);
    expect(data.records).toHaveLength(1);
    expect(data).toMatchObject({ rangeStartMs: range.startMs, rangeEndMs: range.endMs });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("preserves the window during records fallback and rounds only legacy hours", async () => {
    rpcMock.mockImplementation((method: string) => {
      if (method === "public:queryMetrics") return Promise.reject(new MockRpcResponseError("Method not found", -32601));
      return Promise.resolve({ from: timeParams.start, to: timeParams.end, count: 2, records: [record, { ...record, time: "2026-10-09T00:00:00Z" }] });
    });
    const data = await api.getPingRecords("node-a", 1.25, { range, includeStats: false, includeTasks: false });
    expect(rpcMock.mock.calls.find(([method]) => method === "common:getRecords")?.[1]).toMatchObject({ ...timeParams, hours: 2 });
    expect(data.records).toEqual([record]);
    expect(data.count).toBe(1);
  });

  it("does not replace an absolute window with a relative-only HTTP request", async () => {
    rpcMock.mockRejectedValue(new MockRpcResponseError("Method not found", -32601));
    await expect(api.getPingRecords("node-a", 1.25, { range })).rejects.toMatchObject({ name: "HistoryWindowUnsupportedError" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects invalid ranges before making any RPC calls", async () => {
    await expect(api.getPingRecords("node-a", 1, { range: { startMs: 10, endMs: 5 } })).rejects.toBeInstanceOf(RangeError);
    await expect(api.getPingStats("node-a", 1, { range: { startMs: 10, endMs: 5 } })).rejects.toBeInstanceOf(RangeError);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects records from a backend that silently ignores the absolute window", async () => {
    rpcMock.mockImplementation((method: string, params: Record<string, unknown>) => {
      if (method === "public:queryMetrics" && !params.metric_keys) return Promise.resolve({});
      if (method === "public:queryMetrics") return Promise.resolve({ start: "2026-10-10T00:00:00Z", end: "2026-10-10T01:00:00Z", series: [] });
      return Promise.resolve({ from: "2026-10-10T00:00:00Z", to: "2026-10-10T01:00:00Z", count: 0, records: [] });
    });
    await expect(api.getPingRecords("node-a", 1.25, { range, includeStats: false, includeTasks: false }))
      .rejects.toMatchObject({ name: "HistoryWindowUnsupportedError" });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not apply statistics returned for a different time window", async () => {
    rpcMock.mockImplementation((method: string) => Promise.resolve(method === "public:getPingMetricStats"
      ? { start: "2026-10-10T00:00:00Z", end: "2026-10-10T01:00:00Z", stats: [{ task_id: 7, total: 100, valid: 100, avg: 999 }] }
      : {}));
    expect(await api.getPingStats("node-a", 1.25, { range })).toEqual([]);
  });

  it("also rejects mismatched statistics when the caller requests them with the curve", async () => {
    rpcMock.mockImplementation((method: string, params: Record<string, unknown>) => {
      if (method === "public:getPingMetricStats") return Promise.resolve({
        start: "2026-10-10T00:00:00Z", end: "2026-10-10T01:00:00Z",
        stats: [{ task_id: 7, entity_id: "node-a", total: 100, valid: 100, avg: 999 }],
      });
      if (!params.metric_keys) return Promise.resolve({});
      return Promise.resolve({ ...timeParams, series: [{
        metric_key: "ping.latency_ms", entity_id: "node-a", tags: { task_id: "7" }, interval_seconds: 60,
        points: [{ time: record.time, value: 20, count: 1 }],
      }] });
    });
    const data = await api.getPingRecords("node-a", 1.25, { range, includeTasks: false });
    expect(data.stats).toEqual([]);
    expect(data.records[0].value).toBe(20);
  });
});
