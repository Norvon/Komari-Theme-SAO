import type uPlot from "uplot";
import { panPingWindow, zoomPingWindow, type PingHistoryWindow } from "@/utils/pingHistoryWindow";

export interface PingChartNavigation {
  window: PingHistoryWindow;
  domain: PingHistoryWindow;
  pending: boolean;
  onChange: (window: PingHistoryWindow) => void;
  onLatest: (hours?: number) => void;
  onDragging?: (dragging: boolean) => void;
}

export function pingNavigationPlugin(current: () => PingChartNavigation | undefined): uPlot.Plugin {
  let cleanup = () => {};
  return {
    hooks: {
      ready: [(plot) => {
        const overlay = plot.over;
        let drag: { pointerId: number; clientX: number; width: number; window: PingHistoryWindow } | null = null;
        const onDown = (event: PointerEvent) => {
          const navigation = current();
          if (!navigation || event.button !== 0 || drag) return;
          event.preventDefault();
          drag = { pointerId: event.pointerId, clientX: event.clientX, width: overlay.getBoundingClientRect().width, window: navigation.window };
          navigation.onDragging?.(true);
          overlay.setPointerCapture(event.pointerId);
          overlay.style.cursor = "grabbing";
        };
        const onMove = (event: PointerEvent) => {
          const navigation = current();
          if (!navigation || !drag || drag.pointerId !== event.pointerId || drag.width <= 0) return;
          const delta = -(event.clientX - drag.clientX) / drag.width * (drag.window.endMs - drag.window.startMs);
          navigation.onChange(panPingWindow(drag.window, delta, navigation.domain));
        };
        const onUp = (event: PointerEvent) => {
          if (!drag || drag.pointerId !== event.pointerId) return;
          if (event.type === "pointercancel") current()?.onChange(drag.window);
          else onMove(event);
          drag = null;
          current()?.onDragging?.(false);
          if (overlay.hasPointerCapture(event.pointerId)) overlay.releasePointerCapture(event.pointerId);
          overlay.style.cursor = "grab";
        };
        const onWheel = (event: WheelEvent) => {
          const navigation = current();
          if (!navigation || event.deltaY === 0) return;
          event.preventDefault();
          const rect = overlay.getBoundingClientRect();
          if (rect.width <= 0) return;
          const factor = Math.exp(Math.max(-0.5, Math.min(0.5, event.deltaY * 0.002)));
          navigation.onChange(zoomPingWindow(navigation.window, factor, (event.clientX - rect.left) / rect.width, navigation.domain));
        };
        const onLostCapture = (event: PointerEvent) => {
          if (!drag || drag.pointerId !== event.pointerId) return;
          drag = null;
          current()?.onDragging?.(false);
          overlay.style.cursor = "grab";
        };
        const onDoubleClick = (event: MouseEvent) => {
          event.preventDefault();
          current()?.onLatest();
        };
        overlay.style.cursor = "grab";
        overlay.style.touchAction = "pan-y";
        overlay.addEventListener("pointerdown", onDown);
        overlay.addEventListener("pointermove", onMove);
        overlay.addEventListener("pointerup", onUp);
        overlay.addEventListener("pointercancel", onUp);
        overlay.addEventListener("lostpointercapture", onLostCapture);
        overlay.addEventListener("wheel", onWheel, { passive: false });
        overlay.addEventListener("dblclick", onDoubleClick);
        cleanup = () => {
          if (drag) {
            const pointerId = drag.pointerId;
            drag = null;
            current()?.onDragging?.(false);
            if (overlay.hasPointerCapture(pointerId)) overlay.releasePointerCapture(pointerId);
          }
          overlay.removeEventListener("pointerdown", onDown);
          overlay.removeEventListener("pointermove", onMove);
          overlay.removeEventListener("pointerup", onUp);
          overlay.removeEventListener("pointercancel", onUp);
          overlay.removeEventListener("lostpointercapture", onLostCapture);
          overlay.removeEventListener("wheel", onWheel);
          overlay.removeEventListener("dblclick", onDoubleClick);
        };
      }],
      destroy: [() => cleanup()],
    },
  };
}
