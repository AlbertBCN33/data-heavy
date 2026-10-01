import { TestBed } from '@angular/core/testing';

import {
  MAX_VISIBLE_TOASTS,
  TOAST_DURATION_MS,
  ToastService,
} from './toast.service';

describe('ToastService', () => {
  let service: ToastService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = TestBed.inject(ToastService);
  });
  afterEach(() => vi.useRealTimers());

  it('queues toasts with sensible defaults', () => {
    const id = service.show({ message: 'Saved' });
    expect(service.toasts()).toEqual([
      {
        id,
        message: 'Saved',
        kind: 'info',
        action: undefined,
        durationMs: TOAST_DURATION_MS.default,
      },
    ]);
  });

  it('keeps actionable and error toasts longer', () => {
    service.show({
      message: 'a',
      action: { label: 'Undo', run: () => undefined },
    });
    service.show({ message: 'b', kind: 'error' });
    expect(service.toasts().map((t) => t.durationMs)).toEqual([
      TOAST_DURATION_MS.withAction,
      TOAST_DURATION_MS.error,
    ]);
  });

  it('auto-dismisses after its duration', () => {
    service.show({ message: 'Saved', durationMs: 1000 });
    vi.advanceTimersByTime(999);
    expect(service.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(service.toasts()).toHaveLength(0);
  });

  it('keeps a toast with an infinite duration until dismissed', () => {
    const id = service.show({ message: 'Offline', durationMs: Infinity });
    vi.advanceTimersByTime(60_000);
    expect(service.toasts()).toHaveLength(1);
    service.dismiss(id);
    expect(service.toasts()).toHaveLength(0);
  });

  it('pauses and resumes the countdown with the remaining time', () => {
    const id = service.show({ message: 'Saved', durationMs: 1000 });
    vi.advanceTimersByTime(600);
    service.pause(id);
    vi.advanceTimersByTime(10_000);
    expect(service.toasts()).toHaveLength(1);

    service.resume(id);
    vi.advanceTimersByTime(399);
    expect(service.toasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(service.toasts()).toHaveLength(0);
  });

  it('ignores redundant pause and resume calls', () => {
    const id = service.show({ message: 'Saved', durationMs: 1000 });
    service.resume(id); // already running
    service.pause(id);
    service.pause(id); // already paused
    service.pause(999); // unknown
    service.resume(999);
    service.resume(id);
    vi.advanceTimersByTime(1000);
    expect(service.toasts()).toHaveLength(0);
  });

  it('runs the action once and dismisses the toast', () => {
    const run = vi.fn();
    const id = service.show({
      message: 'Removed',
      action: { label: 'Undo', run },
    });
    service.runAction(id);
    service.runAction(id);
    expect(run).toHaveBeenCalledOnce();
    expect(service.toasts()).toHaveLength(0);
  });

  it('drops the oldest toasts beyond the visible limit', () => {
    const ids = Array.from({ length: MAX_VISIBLE_TOASTS + 2 }, (_, i) =>
      service.show({ message: `t${i}` }),
    );
    expect(service.toasts().map((t) => t.id)).toEqual(
      ids.slice(-MAX_VISIBLE_TOASTS),
    );
  });

  it('clears timers when destroyed', () => {
    service.show({ message: 'Saved' });
    TestBed.resetTestingModule();
    expect(() => vi.runAllTimers()).not.toThrow();
  });
});
