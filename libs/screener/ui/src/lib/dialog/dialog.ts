import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  DOCUMENT,
  type ElementRef,
  inject,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';

import { Button } from '../button/button';
import { ModalStack } from '../modal/modal-stack';
import { ToastOutlet } from '../toast/toast-outlet';

export type DialogVariant = 'modal' | 'drawer';

let nextId = 0;

/**
 * Modal dialog or side drawer built on the native `<dialog>` element. `showModal()` provides
 * the top layer, an inert background, focus containment and Escape handling natively, so there
 * is no JavaScript focus trap to maintain.
 *
 * Open state is a two-way `model`, so it can be driven by the URL. Focus returns to the element
 * that had it before opening. Content stays mounted while closed; wrap expensive content in
 * `@if` or `@defer` in the consumer.
 *
 * ```html
 * <dh-dialog [(open)]="detailOpen" label="Instrument details" variant="drawer" closeLabel="Close">
 *   …
 *   <div dhDialogFooter>…</div>
 * </dh-dialog>
 * ```
 */
@Component({
  selector: 'dh-dialog',
  imports: [Button, ToastOutlet],
  templateUrl: './dialog.html',
  styleUrl: './dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Dialog {
  readonly open = model(false);
  /** Visible title; also the dialog's accessible name. */
  readonly label = input.required<string>();
  readonly variant = input<DialogVariant>('modal');
  /** Accessible name of the close button (pass a translated string). */
  readonly closeLabel = input('Close');

  protected readonly headingId = `dh-dialog-title-${nextId++}`;
  private readonly dialog =
    viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly document = inject(DOCUMENT);
  private readonly modals = inject(ModalStack);
  /** Whether this dialog is currently counted as an open modal. */
  protected readonly shown = signal(false);
  private returnFocusTo: HTMLElement | null = null;

  constructor() {
    // Destroyed while open (e.g. navigating away): release the modal count.
    inject(DestroyRef).onDestroy(() => this.markShown(false));
    afterRenderEffect({
      write: () => {
        const dialog = this.dialog().nativeElement;
        if (this.open() && !dialog.open) {
          this.returnFocusTo = this.document
            .activeElement as HTMLElement | null;
          dialog.showModal();
          this.markShown(true);
        } else if (!this.open() && dialog.open) {
          dialog.close();
        }
      },
    });
  }

  /** Native `close` event: fired by `close()`, Escape, or a `method="dialog"` form. */
  protected onNativeClose(): void {
    this.markShown(false);
    this.open.set(false);
    const target = this.returnFocusTo;
    this.returnFocusTo = null;
    if (target?.isConnected) {
      target.focus();
    }
  }

  private markShown(shown: boolean): void {
    if (shown === this.shown()) {
      return;
    }
    this.shown.set(shown);
    if (shown) {
      this.modals.push();
    } else {
      this.modals.pop();
    }
  }

  /** Clicks on the `::backdrop` target the `<dialog>` element itself, not its content. */
  protected onDialogClick(event: MouseEvent): void {
    if (event.target === this.dialog().nativeElement) {
      this.open.set(false);
    }
  }
}
