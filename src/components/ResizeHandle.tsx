"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";

type Props = {
  orientation: "vertical" | "horizontal";
  onDrag: (deltaPx: number) => void;
  label: string;
};

export function ResizeHandle({ orientation, onDrag, label }: Props) {
  const [dragging, setDragging] = useState(false);
  const last = useRef(0);

  const onPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      last.current = orientation === "vertical" ? e.clientX : e.clientY;
      setDragging(true);
    },
    [orientation],
  );

  const onPointerMove = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      if (!dragging) return;
      const pos = orientation === "vertical" ? e.clientX : e.clientY;
      const delta = pos - last.current;
      if (delta === 0) return;
      last.current = pos;
      onDrag(delta);
    },
    [dragging, onDrag, orientation],
  );

  const end = useCallback(() => setDragging(false), []);

  useEffect(() => {
    if (!dragging) return;
    const prev = document.body.style.cursor;
    const select = document.body.style.userSelect;
    document.body.style.cursor =
      orientation === "vertical" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
    return () => {
      document.body.style.cursor = prev;
      document.body.style.userSelect = select;
    };
  }, [dragging, orientation]);

  return (
    <div
      role="separator"
      aria-orientation={orientation}
      aria-label={label}
      tabIndex={0}
      className={
        orientation === "vertical"
          ? `resize-handle resize-v${dragging ? " dragging" : ""}`
          : `resize-handle resize-h${dragging ? " dragging" : ""}`
      }
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
    />
  );
}
