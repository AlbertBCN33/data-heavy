import { computed, Injectable, signal } from '@angular/core';

/**
 * Counts open modal dialogs. A modal `<dialog>` makes the rest of the page inert, so anything
 * interactive that must stay usable (toasts with Undo/Retry) has to render inside the dialog
 * while one is open. Components consult this to decide where to render.
 */
@Injectable({ providedIn: 'root' })
export class ModalStack {
  private readonly depth = signal(0);

  readonly open = computed(() => this.depth() > 0);

  push(): void {
    this.depth.update((d) => d + 1);
  }

  pop(): void {
    this.depth.update((d) => Math.max(0, d - 1));
  }
}
