import { DestroyRef, inject, Injectable, signal } from '@angular/core';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastAction {
  /** Visible, translated label, e.g. "Undo". */
  readonly label: string;
  readonly run: () => void;
}

export interface ToastOptions {
  readonly message: string;
  readonly kind?: ToastKind;
  readonly action?: ToastAction;
  /** Auto-dismiss delay; `Infinity` keeps the toast until dismissed. */
  readonly durationMs?: number;
}

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly kind: ToastKind;
  readonly action?: ToastAction;
  readonly durationMs: number;
}

/** Longer for toasts the user may need to act on or read carefully. */
export const TOAST_DURATION_MS = {
  default: 5_000,
  withAction: 8_000,
  error: 8_000,
};
export const MAX_VISIBLE_TOASTS = 3;

interface Timer {
  handle: ReturnType<typeof setTimeout> | null;
  remaining: number;
  startedAt: number;
}

/**
 * Queue of transient notifications. Rendered by `<dh-toast-outlet>`.
 *
 * Auto-dismiss timers pause while a toast is hovered or focused (see `pause`/`resume`), so
 * users who need more time to read or reach the action get it (WCAG 2.2.1).
 */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<readonly Toast[]>([]);
  readonly toasts = this.items.asReadonly();

  private readonly timers = new Map<number, Timer>();
  private nextId = 1;

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const timer of this.timers.values()) {
        clearTimeout(timer.handle ?? undefined);
      }
      this.timers.clear();
    });
  }

  show(options: ToastOptions): number {
    const kind = options.kind ?? 'info';
    const toast: Toast = {
      id: this.nextId++,
      message: options.message,
      kind,
      action: options.action,
      durationMs:
        options.durationMs ??
        (kind === 'error'
          ? TOAST_DURATION_MS.error
          : options.action
            ? TOAST_DURATION_MS.withAction
            : TOAST_DURATION_MS.default),
    };

    const overflow = this.items().length + 1 - MAX_VISIBLE_TOASTS;
    for (const old of this.items().slice(0, Math.max(0, overflow))) {
      this.dismiss(old.id);
    }
    this.items.update((items) => [...items, toast]);
    if (Number.isFinite(toast.durationMs)) {
      this.timers.set(toast.id, {
        handle: null,
        remaining: toast.durationMs,
        startedAt: 0,
      });
      this.resume(toast.id);
    }
    return toast.id;
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) {
      clearTimeout(timer.handle ?? undefined);
      this.timers.delete(id);
    }
    this.items.update((items) => items.filter((t) => t.id !== id));
  }

  /** Runs the toast's action once and dismisses it. */
  runAction(id: number): void {
    const toast = this.items().find((t) => t.id === id);
    this.dismiss(id);
    toast?.action?.run();
  }

  /** Stops the auto-dismiss countdown, keeping the remaining time. */
  pause(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle === null) {
      return;
    }
    clearTimeout(timer.handle);
    timer.handle = null;
    timer.remaining = Math.max(
      0,
      timer.remaining - (Date.now() - timer.startedAt),
    );
  }

  /** Restarts the countdown with the time that was left. */
  resume(id: number): void {
    const timer = this.timers.get(id);
    if (!timer || timer.handle !== null) {
      return;
    }
    timer.startedAt = Date.now();
    timer.handle = setTimeout(() => this.dismiss(id), timer.remaining);
  }
}
