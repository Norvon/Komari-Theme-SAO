import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NodeInfoSchema, type NodeInfo } from "@/types/komari";

const { getNodesMock, getStatusMock } = vi.hoisted(() => ({
  getNodesMock: vi.fn(),
  getStatusMock: vi.fn(),
}));
vi.mock("@/services/api", () => ({
  getNodes: getNodesMock,
  getNodesLatestStatus: getStatusMock,
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const node = NodeInfoSchema.parse({ uuid: "node-1", name: "Node One", mem_total: 1024 });
const status = { "node-1": { online: true, cpu: 42, ram: 512, net_out: 128 } };

describe("node store bootstrap", () => {
  let store: typeof import("@/services/wsStore");
  let release: (() => void) | undefined;

  beforeEach(async () => {
    vi.resetModules();
    vi.useFakeTimers();
    getNodesMock.mockReset().mockResolvedValue([node]);
    getStatusMock.mockReset().mockResolvedValue(status);
    vi.stubGlobal("window", {
      setTimeout, clearTimeout, setInterval, clearInterval,
      addEventListener: vi.fn(), removeEventListener: vi.fn(),
    });
    store = await import("@/services/wsStore");
  });

  afterEach(async () => {
    release?.();
    release = undefined;
    await vi.advanceTimersByTimeAsync(1);
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("publishes metadata, metrics and traffic trends together on the first notification", async () => {
    const pending = deferred<Record<string, unknown>>();
    getStatusMock.mockReturnValueOnce(pending.promise);
    const snapshots: Array<{ hydrated: boolean; online: boolean | null | undefined }> = [];
    store.subscribeHomeNodeSummaries(() => snapshots.push({
      hydrated: store.getStoreStatusSnapshot().hydrated,
      online: store.getNodeMetricsSnapshot(node.uuid)?.online,
    }));
    release = store.retainStore();
    await vi.advanceTimersByTimeAsync(0);

    expect(store.getAllNodeMetaSnapshot()).toEqual([]);
    expect(store.getStoreStatusSnapshot().hydrated).toBe(false);
    expect(snapshots).toEqual([]);
    expect(getStatusMock).toHaveBeenCalledWith([node.uuid], expect.objectContaining({ timeout: 8000 }));

    pending.resolve(status);
    await vi.advanceTimersByTimeAsync(0);
    expect(snapshots).toEqual([{ hydrated: true, online: true }]);
    expect(store.getNodeMetricsSnapshot(node.uuid)).toMatchObject({ cpuPct: 42, ramPct: 50 });
    expect(store.getNodeTrafficTrendSnapshot(node.uuid).up.at(-1)?.value).toBe(128);
    expect(getStatusMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(getStatusMock).toHaveBeenCalledTimes(2);
  });

  it("shares a slow metadata request and discards it after release", async () => {
    const pending = deferred<NodeInfo[]>();
    getNodesMock.mockReturnValueOnce(pending.promise);
    release = store.retainStore();
    await vi.advanceTimersByTimeAsync(4000);
    expect(getNodesMock).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1);
    expect(getNodesMock.mock.calls[0][0].signal.aborted).toBe(true);
    pending.resolve([node]);
    await vi.advanceTimersByTimeAsync(0);
    expect(getStatusMock).not.toHaveBeenCalled();
    expect(store.getAllNodeMetaSnapshot()).toEqual([]);
    expect(store.getStoreStatusSnapshot().hydrated).toBe(false);
  });

  it("shares a slow initial status request and discards it after release", async () => {
    const pending = deferred<Record<string, unknown>>();
    getStatusMock.mockReturnValueOnce(pending.promise);
    release = store.retainStore();
    await vi.advanceTimersByTimeAsync(4000);
    expect(getNodesMock).toHaveBeenCalledTimes(1);
    expect(getStatusMock).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1);
    expect(getStatusMock.mock.calls[0][1].signal.aborted).toBe(true);
    pending.resolve(status);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getAllNodeMetaSnapshot()).toEqual([]);
    expect(store.getStoreStatusSnapshot().hydrated).toBe(false);
  });

  it("shows metadata after a status timeout and recovers on the next poll", async () => {
    getStatusMock.mockRejectedValueOnce(new DOMException("Request timed out", "TimeoutError"));
    release = store.retainStore();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getStoreStatusSnapshot()).toMatchObject({ hydrated: true, failureStreak: 1, nodeInfoError: false });
    expect(store.getNodeMetaSnapshot(node.uuid)?.name).toBe("Node One");
    expect(store.getNodeMetricsSnapshot(node.uuid)?.online).toBeNull();
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.getNodeMetricsSnapshot(node.uuid)?.online).toBe(true);
    expect(store.getStoreStatusSnapshot().failureStreak).toBe(0);
  });

  it("finishes an empty node list without requesting statuses", async () => {
    getNodesMock.mockResolvedValueOnce([]);
    release = store.retainStore();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getStoreStatusSnapshot().hydrated).toBe(true);
    expect(getStatusMock).not.toHaveBeenCalled();
  });

  it("refreshes retained metrics when the store starts again", async () => {
    release = store.retainStore();
    await vi.advanceTimersByTimeAsync(0);
    release();
    await vi.advanceTimersByTimeAsync(1);
    getStatusMock.mockResolvedValueOnce({ "node-1": { online: true, cpu: 77 } });
    release = store.retainStore();
    await vi.advanceTimersByTimeAsync(0);
    expect(store.getNodeMetricsSnapshot(node.uuid)?.cpuPct).toBe(77);
    expect(getStatusMock).toHaveBeenCalledTimes(2);
  });
});
