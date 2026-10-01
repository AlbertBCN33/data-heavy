import {
  booleanAttribute,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
} from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md';

/**
 * Styles a native `<button>` or `<a>`, so semantics, keyboard behaviour and form submission
 * stay native.
 *
 * While `loading`, the button stays focusable (so focus is not lost mid-action) but is marked
 * `aria-disabled` and `aria-busy`, and clicks are swallowed before any `(click)` handler runs.
 *
 * ```html
 * <button dhButton variant="primary" [loading]="saving()">Save</button>
 * ```
 */
@Component({
  // Attribute selector on purpose: the host stays a native <button>/<a>, keeping its semantics.
  // eslint-disable-next-line @angular-eslint/component-selector
  selector: 'button[dhButton], a[dhButton]',
  templateUrl: './button.html',
  styleUrl: './button.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'dh-button',
    '[class]': '"dh-button--" + variant() + " dh-button--" + size()',
    '[class.dh-button--loading]': 'loading()',
    '[attr.aria-busy]': 'loading() || null',
    '[attr.aria-disabled]': 'loading() || null',
  },
})
export class Button {
  readonly variant = input<ButtonVariant>('secondary');
  readonly size = input<ButtonSize>('md');
  readonly loading = input(false, { transform: booleanAttribute });

  constructor() {
    // A host `(click)` listener would run after the consumer's own `(click)` binding. A
    // capture-phase listener on the element runs first, so the click never reaches it.
    const element = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const swallowWhileLoading = (event: MouseEvent) => {
      if (this.loading()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    element.addEventListener('click', swallowWhileLoading, { capture: true });
    inject(DestroyRef).onDestroy(() =>
      element.removeEventListener('click', swallowWhileLoading, {
        capture: true,
      }),
    );
  }
}
