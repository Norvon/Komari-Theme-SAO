import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryMock, loadMock, pingMock, statsMock, tasksMock } = vi.hoisted(() => ({
  queryMock: vi.fn(), loadMock: vi.fn(), pingMock: vi.fn(), statsMock: vi.fn(), tasksMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", () => ({ useQuery: queryMock }));
vi.mock("@/services/api", () => ({
  getLoadRecords: loadMock, getPingRecords: pingMock, getPingStats: statsMock, getPublicPingTasks: tasksMock,
}));

import { useLoadRecords, usePingRecords, usePingRecordStats, usePublicPingTasks } from "@/hooks/useRecords";

describe("chart query wiring", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requests the Ping curve without waiting for auxiliary data", async () => {
    usePingRecords("node-a", 24);
    const query = queryMock.mock.calls[0][0];
    const signal = new AbortController().signal;
    await query.queryFn({ signal });

    expect(pingMock).toHaveBeenCalledWith("node-a", 24, { signal, includeStats: false, includeTasks: false });
    expect(query.queryKey).toEqual(["records", "ping", "node-a", 24]);
  });

  it("isolates stats by node and time range and forwards cancellation", async () => {
    usePingRecordStats("node-a", 1);
    usePingRecordStats("node-b", 24, false);
    const first = queryMock.mock.calls[0][0];
    const second = queryMock.mock.calls[1][0];
    const signal = new AbortController().signal;
    await first.queryFn({ signal });

    expect(first.queryKey).toEqual(["records", "ping-stats", "node-a", 1]);
    expect(second.queryKey).toEqual(["records", "ping-stats", "node-b", 24]);
    expect(second.enabled).toBe(false);
    expect(statsMock).toHaveBeenCalledWith("node-a", 1, { signal });
  });

  it("shares public names and keeps hidden or unassigned queries disabled", () => {
    usePublicPingTasks(false);
    useLoadRecords("", 1);
    usePingRecords("node-a", 1, false);

    expect(queryMock.mock.calls.map(([query]) => query.enabled)).toEqual([false, false, false]);
    expect(queryMock.mock.calls[0][0].queryKey).toEqual(["public-ping-tasks"]);
  });

});
