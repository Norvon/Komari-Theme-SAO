import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import {
  HISTORY_HOUR_MS,
  MIN_PING_WINDOW_MS,
  formatPingWindowTime,
  panPingWindow,
  resizePingWindow,
  type PingHistoryWindow,
} from "@/utils/pingHistoryWindow";
import type { PingChartNavigation } from "./pingNavigation";

export function PingTimeNavigator({ navigation }: { navigation: PingChartNavigation }) {
  const { window, domain, onChange, onLatest, onDragging } = navigation;
  const dragRef = useRef<{ pointerId: number; clientX: number; width: number; edge: "start" | "end" | "pan"; window: PingHistoryWindow } | null>(null);
  const span = domain.endMs - domain.startMs;
  const startPercent = (window.startMs - domain.startMs) / span * 100;
  const widthPercent = (window.endMs - window.startMs) / span * 100;
  const startTime = formatPingWindowTime(window.startMs);
  const endTime = formatPingWindowTime(window.endMs);
  const move = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId || drag.width <= 0) return;
    const delta = (event.clientX - drag.clientX) / drag.width * span;
    onChange(drag.edge === "pan" ? panPingWindow(drag.window, delta, domain) : resizePingWindow(drag.window, drag.edge, delta, domain));
  };
  const keyboard = (event: KeyboardEvent<HTMLButtonElement>, edge: "start" | "end" | "pan") => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const delta = event.key === "Home" ? -span : event.key === "End" ? span
      : (event.key === "ArrowLeft" ? -1 : 1) * HISTORY_HOUR_MS * (event.shiftKey ? 24 : 1);
    onChange(edge === "pan" ? panPingWindow(window, delta, domain) : resizePingWindow(window, edge, delta, domain));
  };
  return (
    <div className="instance-ping-navigator">
      <div className="instance-ping-window-label">
        <span>{startTime} — {endTime}</span>
        <button type="button" className="instance-toggle-button" onClick={() => onLatest()}>回到最近 1 天</button>
      </div>
      <div
        className={`instance-ping-time-rail${navigation.pending ? " is-changing" : ""}`}
        onPointerDown={(event) => {
          if (event.button !== 0 || dragRef.current) return;
          const target = (event.target as HTMLElement).closest<HTMLElement>("[data-edge]");
          if (!target) return;
          event.preventDefault();
          target.focus();
          const edge = target.dataset.edge as "start" | "end" | "pan";
          dragRef.current = { pointerId: event.pointerId, clientX: event.clientX, width: event.currentTarget.getBoundingClientRect().width, edge, window };
          onDragging?.(true);
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={move}
        onPointerUp={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          move(event);
          dragRef.current = null;
          onDragging?.(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onPointerCancel={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          onChange(dragRef.current.window);
          dragRef.current = null;
          onDragging?.(false);
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }}
        onLostPointerCapture={(event) => {
          if (dragRef.current?.pointerId !== event.pointerId) return;
          dragRef.current = null;
          onDragging?.(false);
        }}
      >
        <div className="instance-ping-time-window" style={{ left: `${startPercent}%`, width: `${widthPercent}%` }}>
          <button type="button" data-edge="pan" className="instance-ping-time-pan" aria-label="拖动 Ping 时间窗口" onKeyDown={(event) => keyboard(event, "pan")} />
          {(["start", "end"] as const).map((edge) => (
            <button
              key={edge}
              type="button"
              role="slider"
              data-edge={edge}
              className="instance-ping-time-handle"
              aria-label={edge === "start" ? "Ping 开始时间" : "Ping 结束时间"}
              aria-valuemin={edge === "start" ? domain.startMs : window.startMs + Math.min(MIN_PING_WINDOW_MS, span)}
              aria-valuemax={edge === "end" ? domain.endMs : window.endMs - Math.min(MIN_PING_WINDOW_MS, span)}
              aria-valuenow={edge === "start" ? window.startMs : window.endMs}
              aria-valuetext={edge === "start" ? startTime : endTime}
              onKeyDown={(event) => keyboard(event, edge)}
            />
          ))}
        </div>
        {(["start", "end"] as const).map((edge) => (
          <div
            key={edge}
            className={`instance-ping-time-boundary is-${edge}`}
            style={{ left: `clamp(0px, calc(${edge === "start" ? startPercent : startPercent + widthPercent}% - var(--ping-time-label-width) / 2), calc(100% - var(--ping-time-label-width)))` }}
            aria-hidden="true"
          >
            <span>{edge === "start" ? "开始" : "结束"}</span>
            <time dateTime={new Date(edge === "start" ? window.startMs : window.endMs).toISOString()}>{edge === "start" ? startTime : endTime}</time>
          </div>
        ))}
      </div>
      <div className="instance-ping-window-label instance-ping-window-hint">
        <span>{formatPingWindowTime(domain.startMs)}</span><span>{formatPingWindowTime(domain.endMs)}</span>
      </div>
      <p className="instance-ping-window-hint">拖动选区平移，两端调整时长；主图可拖动、滚轮缩放，双击回到最近 1 天。</p>
    </div>
  );
}
