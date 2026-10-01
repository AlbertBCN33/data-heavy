import { NgTemplateOutlet } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
} from '@angular/core';

import { Button } from '../button/button';
import { ToastService } from './toast.service';

/**
 * Renders the toast queue. Place once, at the end of the app shell.
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
})
export class ToastOutlet {
  /** Accessible name of each dismiss button (pass a translated string). */
  readonly dismissLabel = input('Dismiss');
  /** Accessible name of the notifications region. */
  readonly regionLabel = input('Notifications');

  protected readonly service = inject(ToastService);
  protected readonly polite = computed(() =>
    this.service.toasts().filter((t) => t.kind !== 'error'),
  );
  protected readonly assertive = computed(() =>
    this.service.toasts().filter((t) => t.kind === 'error'),
  );
}
