import { useQuery } from "@tanstack/react-query";
import { getLoadRecords, getPingRecords, getPingStats, getPublicPingTasks } from "@/services/api";
import type { PingHistoryWindow } from "@/utils/pingHistoryWindow";

const RECORD_QUERY_OPTIONS = {
  staleTime: 300_000,
  refetchOnWindowFocus: false,
  refetchOnReconnect: false,
} as const;

export function useLoadRecords(uuid: string, hours = 6, enabled = true) {
  return useQuery({
    queryKey: ["records", "load", uuid, hours],
    queryFn: ({ signal }) => getLoadRecords(uuid, hours, { signal }),
    ...RECORD_QUERY_OPTIONS,
    enabled: Boolean(uuid) && enabled,
  });
}

export function usePingRecords(uuid: string, hours = 6, enabled = true, range?: PingHistoryWindow) {
  return useQuery({
    queryKey: range ? ["records", "ping", uuid, hours, range.startMs, range.endMs] : ["records", "ping", uuid, hours],
    queryFn: ({ signal }) => getPingRecords(uuid, hours, {
      signal,
      includeStats: false,
      includeTasks: false,
      ...(range ? { range } : {}),
    }),
    placeholderData: (previous, previousQuery) => range && previousQuery?.queryKey[2] === uuid ? previous : undefined,
    ...RECORD_QUERY_OPTIONS,
    enabled: Boolean(uuid) && enabled,
  });
}

// 统计与曲线同时开始但独立返回；缓存键隔离节点和时间范围。
export function usePingRecordStats(uuid: string, hours = 6, enabled = true, range?: PingHistoryWindow) {
  return useQuery({
    queryKey: range ? ["records", "ping-stats", uuid, hours, range.startMs, range.endMs] : ["records", "ping-stats", uuid, hours],
    queryFn: ({ signal }) => getPingStats(uuid, hours, { signal, ...(range ? { range } : {}) }),
    ...RECORD_QUERY_OPTIONS,
    enabled: Boolean(uuid) && enabled,
  });
}

export function usePublicPingTasks(enabled = true) {
  return useQuery({
    queryKey: ["public-ping-tasks"],
    queryFn: ({ signal }) => getPublicPingTasks({ signal }),
    ...RECORD_QUERY_OPTIONS,
    staleTime: 60_000,
    enabled,
  });
}
