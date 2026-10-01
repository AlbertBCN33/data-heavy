import {
  Combobox,
  ComboboxPopup,
  ComboboxWidget,
} from '@angular/aria/combobox';
import { Listbox, Option } from '@angular/aria/listbox';
import { OverlayModule } from '@angular/cdk/overlay';
import {
  afterRenderEffect,
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  model,
  signal,
  viewChild,
} from '@angular/core';

export interface SelectOption {
  readonly value: string;
  /** Visible, translated text. */
  readonly label: string;
}

let nextId = 0;

/**
 * Multi-select dropdown following the WAI-ARIA combobox + listbox pattern, built on Angular Aria
 * (as in the angular.dev multiselect guide) with a CDK overlay for positioning.
 *
 * Keyboard: Enter/Space/Alt+ArrowDown open, arrows move, Space toggles, Escape closes. The listbox
 * uses `aria-activedescendant`, so DOM focus stays on the trigger.
 *
 * Meant for short, fixed option lists (under ~20); longer lists need a searchable autocomplete.
 */
@Component({
  selector: 'dh-multi-select',
  imports: [
    Combobox,
    ComboboxPopup,
    ComboboxWidget,
    Listbox,
    Option,
    OverlayModule,
  ],
  templateUrl: './multi-select.html',
  styleUrl: './multi-select.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MultiSelect {
  /** Visible label, associated with the trigger. */
  readonly label = input.required<string>();
  readonly options = input.required<readonly SelectOption[]>();
  /** Shown when nothing is selected (e.g. "Any"). */
  readonly placeholder = input('');
  /** Selected option values. */
  readonly value = model<readonly string[]>([]);

  protected readonly labelId = `dh-multi-select-label-${nextId++}`;
  protected readonly expanded = signal(false);
  private readonly listbox = viewChild(Listbox);

  /** "Energy", or "Energy +2" when several are selected; option order, not click order. */
  protected readonly summary = computed(() => {
    const selected = this.options().filter((o) =>
      this.value().includes(o.value),
    );
    const [first] = selected;
    if (!first) {
      return this.placeholder();
    }
    return selected.length === 1
      ? first.label
      : `${first.label} +${selected.length - 1}`;
  });

  /** Two-way binding target for the listbox, which works with mutable arrays. */
  protected readonly selection = computed(() => [...this.value()]);

  constructor() {
    afterRenderEffect(() => {
      this.listbox()?.scrollActiveItemIntoView();
    });
  }

  protected onSelectionChange(values: string[]): void {
    this.value.set(values);
  }
}
