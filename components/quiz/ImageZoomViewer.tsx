'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { CloseIcon, ExpandIcon, ZoomInIcon, ZoomOutIcon } from '@/components/icons';

/**
 * Full-screen image viewer with zoom + pan, used to let students read
 * dense book pages in the chapter quiz's Reference tab.
 *
 * Rendered through a portal into document.body so the quiz's scrolling,
 * transformed panes can't trap `position: fixed`. No zoom library: one
 * transform {scale, x, y} is driven by wheel, pointer (drag / pinch),
 * double-tap and keyboard input, clamped so the page can't be lost.
 */

const MIN_SCALE = 1;
const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const BUTTON_STEP = 1.5;
const DOUBLE_TAP_MS = 300;
const TAP_SLOP_PX = 8;
const KEY_PAN_PX = 60;

type Transform = { scale: number; x: number; y: number };
type Point = { x: number; y: number };

const IDENTITY: Transform = { scale: 1, x: 0, y: 0 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function ImageZoomViewer({
  open,
  src,
  alt,
  onClose,
}: {
  open: boolean;
  src: string;
  alt: string;
  onClose: () => void;
}) {
  if (typeof document === 'undefined') return null;
  return createPortal(
    <AnimatePresence>
      {open && <ViewerDialog src={src} alt={alt} onClose={onClose} />}
    </AnimatePresence>,
    document.body,
  );
}

function ViewerDialog({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const dialogRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  // Source of truth is the ref (read by native listeners); state mirrors it
  // to trigger renders.
  const tRef = useRef<Transform>(IDENTITY);
  const [t, setT] = useState<Transform>(IDENTITY);
  const [smooth, setSmooth] = useState(false);
  const [failed, setFailed] = useState(false);

  const pointers = useRef(new Map<number, Point>());
  const panStart = useRef<{ p: Point; t: Transform } | null>(null);
  const pinchStart = useRef<{ dist: number; mid: Point; t: Transform } | null>(null);
  const moved = useRef(false);
  // What the gesture started on. pointerup's target is unreliable because
  // setPointerCapture retargets it to the stage, so record it on pointerdown.
  const downOnImage = useRef(false);
  const lastTap = useRef<{ time: number; p: Point } | null>(null);

  /** Keep the (scaled) image from being dragged out of the viewport. */
  const clampTranslate = useCallback((next: Transform): Transform => {
    const stage = stageRef.current;
    const img = imgRef.current;
    if (!stage || !img || next.scale <= MIN_SCALE) return { ...next, x: 0, y: 0 };
    const maxX = Math.max(0, (img.offsetWidth * next.scale - stage.clientWidth) / 2);
    const maxY = Math.max(0, (img.offsetHeight * next.scale - stage.clientHeight) / 2);
    return { scale: next.scale, x: clamp(next.x, -maxX, maxX), y: clamp(next.y, -maxY, maxY) };
  }, []);

  const apply = useCallback(
    (next: Transform, animate = false) => {
      const clamped = clampTranslate({
        ...next,
        scale: clamp(next.scale, MIN_SCALE, MAX_SCALE),
      });
      tRef.current = clamped;
      setSmooth(animate);
      setT(clamped);
    },
    [clampTranslate],
  );

  /** Point relative to the stage centre (the transform origin). */
  const toCentered = useCallback((clientX: number, clientY: number): Point => {
    const r = stageRef.current!.getBoundingClientRect();
    return { x: clientX - r.left - r.width / 2, y: clientY - r.top - r.height / 2 };
  }, []);

  /** Zoom to `scale`, keeping the content under `at` (centred coords) fixed. */
  const zoomTo = useCallback(
    (scale: number, at: Point = { x: 0, y: 0 }, animate = false) => {
      const cur = tRef.current;
      const s = clamp(scale, MIN_SCALE, MAX_SCALE);
      const k = s / cur.scale;
      apply(
        { scale: s, x: at.x - (at.x - cur.x) * k, y: at.y - (at.y - cur.y) * k },
        animate,
      );
    },
    [apply],
  );

  // Body scroll lock + focus management (restore focus to the trigger).
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    const prevFocus = document.activeElement as HTMLElement | null;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, []);

  // Wheel needs a non-passive native listener so preventDefault stops
  // trackpad-pinch (ctrl+wheel) from zooming the whole browser page.
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const rate = e.ctrlKey ? 0.01 : 0.0015;
      zoomTo(tRef.current.scale * Math.exp(-e.deltaY * rate), toCentered(e.clientX, e.clientY));
    }
    stage.addEventListener('wheel', onWheel, { passive: false });
    return () => stage.removeEventListener('wheel', onWheel);
  }, [zoomTo, toCentered]);

  // Keyboard: Esc closes, +/-/0 zoom, arrows pan, Tab stays in the dialog.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        zoomTo(tRef.current.scale * BUTTON_STEP, undefined, true);
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        zoomTo(tRef.current.scale / BUTTON_STEP, undefined, true);
      } else if (e.key === '0') {
        e.preventDefault();
        apply({ scale: 1, x: 0, y: 0 }, true);
      } else if (e.key.startsWith('Arrow') && tRef.current.scale > MIN_SCALE) {
        e.preventDefault();
        const cur = tRef.current;
        const dx = e.key === 'ArrowLeft' ? KEY_PAN_PX : e.key === 'ArrowRight' ? -KEY_PAN_PX : 0;
        const dy = e.key === 'ArrowUp' ? KEY_PAN_PX : e.key === 'ArrowDown' ? -KEY_PAN_PX : 0;
        apply({ ...cur, x: cur.x + dx, y: cur.y + dy }, true);
      } else if (e.key === 'Tab') {
        const buttons = toolbarRef.current?.querySelectorAll<HTMLButtonElement>(
          'button:not(:disabled)',
        );
        if (!buttons || buttons.length === 0) return;
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        const active = document.activeElement;
        const inToolbar = !!toolbarRef.current?.contains(active);
        if (!inToolbar) {
          e.preventDefault();
          (e.shiftKey ? last : first).focus();
        } else if (e.shiftKey && active === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [apply, onClose, zoomTo]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is only a nicety (keeps drags alive outside the stage).
    }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) {
      moved.current = false;
      downOnImage.current = e.target === imgRef.current;
      panStart.current = { p: { x: e.clientX, y: e.clientY }, t: tRef.current };
    } else if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      pinchStart.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y) || 1,
        mid: toCentered((a.x + b.x) / 2, (a.y + b.y) / 2),
        t: tRef.current,
      };
      panStart.current = null;
      moved.current = true;
    }
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size >= 2 && pinchStart.current) {
      const [a, b] = [...pointers.current.values()];
      const start = pinchStart.current;
      const dist = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const mid = toCentered((a.x + b.x) / 2, (a.y + b.y) / 2);
      const s = clamp(start.t.scale * (dist / start.dist), MIN_SCALE, MAX_SCALE);
      const k = s / start.t.scale;
      apply({
        scale: s,
        x: mid.x - (start.mid.x - start.t.x) * k,
        y: mid.y - (start.mid.y - start.t.y) * k,
      });
      return;
    }

    const start = panStart.current;
    if (!start) return;
    const dx = e.clientX - start.p.x;
    const dy = e.clientY - start.p.y;
    if (Math.hypot(dx, dy) > TAP_SLOP_PX) moved.current = true;
    if (tRef.current.scale > MIN_SCALE && moved.current) {
      apply({ scale: tRef.current.scale, x: start.t.x + dx, y: start.t.y + dy });
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    const wasSingle = pointers.current.size === 1;
    pointers.current.delete(e.pointerId);
    pinchStart.current = null;

    // Lifting one finger of a pinch: continue as a pan from the remaining one.
    if (pointers.current.size === 1) {
      const [p] = [...pointers.current.values()];
      panStart.current = { p, t: tRef.current };
      return;
    }
    panStart.current = null;
    if (!wasSingle || moved.current) return;

    const onImage = downOnImage.current;
    const now = performance.now();
    const p = { x: e.clientX, y: e.clientY };
    const prev = lastTap.current;

    // Double click / double tap on the image toggles fit <-> 2.5x.
    if (
      onImage &&
      prev &&
      now - prev.time < DOUBLE_TAP_MS &&
      Math.hypot(p.x - prev.p.x, p.y - prev.p.y) < 24
    ) {
      lastTap.current = null;
      if (tRef.current.scale > MIN_SCALE) apply({ scale: 1, x: 0, y: 0 }, true);
      else zoomTo(DOUBLE_TAP_SCALE, toCentered(p.x, p.y), true);
      return;
    }
    lastTap.current = { time: now, p };

    // A plain tap on the empty backdrop closes (only when not zoomed in).
    if (!onImage && tRef.current.scale === MIN_SCALE) onClose();
  }

  function onPointerCancel(e: React.PointerEvent<HTMLDivElement>) {
    pointers.current.delete(e.pointerId);
    pinchStart.current = null;
    panStart.current = null;
  }

  const pct = Math.round(t.scale * 100);
  const atMin = t.scale <= MIN_SCALE;
  const atMax = t.scale >= MAX_SCALE;

  return (
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="Reference page viewer"
      tabIndex={-1}
      className="fixed inset-0 z-[60] flex flex-col outline-none"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.2 }}
    >
      <div className="absolute inset-0 bg-black/85 backdrop-blur-sm" aria-hidden="true" />

      <div
        ref={stageRef}
        data-testid="zoom-stage"
        className="relative flex flex-1 select-none items-center justify-center overflow-hidden"
        style={{ touchAction: 'none', cursor: atMin ? 'zoom-in' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        {failed ? (
          <p className="max-w-xs px-6 text-center text-sm text-white/80">
            This page image expired. Close the viewer and reopen the question to reload it.
          </p>
        ) : (
          // Plain <img>: signed bucket URLs aren't next/image remotePatterns.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={src}
            alt={alt}
            draggable={false}
            onError={() => setFailed(true)}
            className="max-h-full max-w-full object-contain"
            style={{
              transform: `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scale})`,
              transformOrigin: 'center center',
              transition: smooth && !reduceMotion ? 'transform 0.18s ease-out' : 'none',
              willChange: 'transform',
            }}
          />
        )}
      </div>

      <div
        ref={toolbarRef}
        className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between p-4"
      >
        <div
          className="pointer-events-auto flex items-center gap-1 rounded-full px-1.5 py-1.5"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}
        >
          <ToolbarButton
            label="Zoom out"
            disabled={atMin}
            onClick={() => zoomTo(tRef.current.scale / BUTTON_STEP, undefined, true)}
          >
            <ZoomOutIcon size={18} />
          </ToolbarButton>
          <span
            className="min-w-[3.25rem] text-center text-xs font-medium tabular-nums"
            style={{ color: 'var(--text2)' }}
            aria-live="polite"
          >
            {pct}%
          </span>
          <ToolbarButton
            label="Zoom in"
            disabled={atMax}
            onClick={() => zoomTo(tRef.current.scale * BUTTON_STEP, undefined, true)}
          >
            <ZoomInIcon size={18} />
          </ToolbarButton>
          <ToolbarButton
            label="Reset zoom"
            disabled={atMin}
            onClick={() => apply({ scale: 1, x: 0, y: 0 }, true)}
          >
            <ExpandIcon size={18} />
          </ToolbarButton>
        </div>

        <div
          className="pointer-events-auto rounded-full p-1.5"
          style={{ backgroundColor: 'var(--surface)', border: '1px solid var(--line)' }}
        >
          <ToolbarButton label="Close viewer" onClick={onClose}>
            <CloseIcon size={18} />
          </ToolbarButton>
        </div>
      </div>

      <p
        className="pointer-events-none absolute inset-x-0 bottom-4 text-center text-xs text-white/60"
        aria-hidden="true"
      >
        Scroll or pinch to zoom · double-tap to toggle · drag to move
      </p>
    </motion.div>
  );
}

function ToolbarButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      // Keep gestures on the stage from starting when a button is pressed.
      onPointerDown={(e) => e.stopPropagation()}
      className="flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-fill focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 disabled:opacity-40"
      style={{ color: 'var(--text)' }}
    >
      {children}
    </button>
  );
}
