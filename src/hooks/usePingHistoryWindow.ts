import { useCallback, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_PING_HOURS,
  HISTORY_HOUR_MS,
  clampPingWindow,
  latestPingWindow,
  pingHistoryDomain,
  samePingWindow,
  type PingHistoryWindow,
} from "@/utils/pingHistoryWindow";

export function usePingHistoryWindow(uuid: string, maxHours: number) {
  const [dragging, setDragging] = useState(false);
  const [state, setState] = useState(() => {
    const anchorMs = Date.now();
    return { uuid, anchorMs, window: latestPingWindow(pingHistoryDomain(anchorMs, maxHours)) };
  });
  const anchorMs = state.uuid === uuid ? state.anchorMs : Date.now();
  const current = state.uuid === uuid ? state : {
    uuid, anchorMs, window: latestPingWindow(pingHistoryDomain(anchorMs, maxHours)),
  };
  const domain = useMemo(() => pingHistoryDomain(current.anchorMs, maxHours), [current.anchorMs, maxHours]);
  const window = useMemo(() => clampPingWindow(current.window, domain), [current.window, domain]);
  const [request, setRequest] = useState({ uuid, window });
  if (current !== state) {
    setState(current);
    setRequest({ uuid, window });
    setDragging(false);
  }
  const queryWindow = request.uuid === uuid ? clampPingWindow(request.window, domain) : window;
  const pending = !samePingWindow(window, queryWindow);

  useEffect(() => {
    if (dragging || (!pending && request.uuid === uuid)) return;
    // 松开指针或停止滚轮后再查询，避免拖动中反复重启数据库请求。
    const timer = globalThis.setTimeout(() => setRequest({ uuid, window }), 250);
    return () => globalThis.clearTimeout(timer);
  }, [dragging, pending, request.uuid, uuid, window]);

  const onChange = useCallback((next: PingHistoryWindow) => {
    setState((previous) => ({ ...previous, window: clampPingWindow(next, domain) }));
  }, [domain]);
  const onLatest = useCallback((hours = DEFAULT_PING_HOURS) => {
    const anchorMs = Date.now();
    const next = latestPingWindow(pingHistoryDomain(anchorMs, maxHours), hours);
    setState({ uuid, anchorMs, window: next });
    setRequest({ uuid, window: next });
    setDragging(false);
  }, [maxHours, uuid]);
  const hours = (window.endMs - window.startMs) / HISTORY_HOUR_MS;
  return {
    window, domain, queryWindow, pending, onChange, onLatest, onDragging: setDragging,
    selectedHours: window.endMs === domain.endMs ? hours : 0,
    queryHours: (queryWindow.endMs - queryWindow.startMs) / HISTORY_HOUR_MS,
  };
}
