import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  InjectionToken,
  input,
} from '@angular/core';

import { Button } from '../button/button';
import { ModalStack } from '../modal/modal-stack';
import { ToastService } from './toast.service';

export interface ToastLabels {
  /** Accessible name of each dismiss button. */
  readonly dismiss: string;
  /** Accessible name of the notifications region. */
  readonly region: string;
}

/** Translated labels for every toast outlet (the app's and those inside dialogs). */
export const TOAST_LABELS = new InjectionToken<ToastLabels>('TOAST_LABELS', {
  providedIn: 'root',
  factory: () => ({ dismiss: 'Dismiss', region: 'Notifications' }),
});

/**
 * Renders the toast queue.
 *
 * - `scope="page"`: place once at the end of the app shell.
 * - `scope="modal"`: rendered by `dh-dialog` inside itself while open. A modal dialog makes the
 *   rest of the page inert, so toasts with actions (Undo, Retry) must render inside it to stay
 *   usable; the page outlet holds them back meanwhile, so nothing is shown or announced twice.
 *
 * Both live regions are always in the DOM: screen readers only announce changes to regions that
 * already exist. Errors go to an assertive region, everything else to a polite one. Toasts never
 * take focus; they are reachable with Tab and pause their timer while hovered or focused.
 */
@Component({
  selector: 'dh-toast-outlet',
  imports: [Button, NgTemplateOutlet],
  templateUrl: './toast-outlet.html',
  styleUrl: './toast-outlet.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.dh-toasts-host--modal]': 'scope() === "modal"' },
})
export class ToastOutlet {
  readonly scope = input<'page' | 'modal'>('page');

  protected readonly labels = inject(TOAST_LABELS);
  protected readonly service = inject(ToastService);
  private readonly modals = inject(ModalStack);

  private readonly visible = computed(() =>
    this.scope() === 'page' && this.modals.open() ? [] : this.service.toasts(),
  );
  protected readonly polite = computed(() =>
    this.visible().filter((t) => t.kind !== 'error'),
  );
  protected readonly assertive = computed(() =>
    this.visible().filter((t) => t.kind === 'error'),
  );
}
