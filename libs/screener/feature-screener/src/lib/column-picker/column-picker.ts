import { LiveAnnouncer } from '@angular/cdk/a11y';
import {
  afterEveryRender,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { Button, Dialog } from '@data-heavy/ui';
import {
  COLUMN_KEYS,
  type ColumnKey,
  DEFAULT_COLUMNS,
  PINNED_COLUMN,
} from '@data-heavy/util';

import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { columnLabelKey } from '../screener-labels';

export interface ColumnChoice {
  readonly key: ColumnKey;
  readonly visible: boolean;
}

/** Visible columns in their order, then the hidden ones in registry order. */
export function toChoices(columns: readonly ColumnKey[]): ColumnChoice[] {
  return [
    ...columns.map((key) => ({ key, visible: true })),
    ...COLUMN_KEYS.filter((key) => !columns.includes(key)).map((key) => ({
      key,
      visible: false,
    })),
  ];
}

let nextId = 0;

/**
 * Lets users show, hide and reorder columns. Edits happen on a draft inside a dialog and are
 * applied in one step, so reordering does not create a history entry per move.
 *
 * Reordering uses Move up / Move down buttons (keyboard and screen reader friendly). Focus follows
 * the moved column and the new position is announced.
 */
@Component({
  selector: 'dh-column-picker',
  imports: [Button, Dialog, TranslatePipe],
  templateUrl: './column-picker.html',
  styleUrl: './column-picker.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ColumnPicker {
  readonly columns = input.required<readonly ColumnKey[]>();
  readonly columnsChange = output<ColumnKey[]>();

  protected readonly idPrefix = `dh-columns-${nextId++}`;
  protected readonly columnLabelKey = columnLabelKey;
  private readonly translate = inject(TranslateService);
  protected readonly pinned = PINNED_COLUMN;
  protected readonly open = signal(false);
  protected readonly draft = signal<ColumnChoice[]>([]);

  private readonly announcer = inject(LiveAnnouncer);
  private readonly host =
    inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private focusAfterRender: string | null = null;

  constructor() {
    afterEveryRender({
      read: () => {
        if (this.focusAfterRender) {
          this.host
            .querySelector<HTMLElement>(`#${this.focusAfterRender}`)
            ?.focus();
          this.focusAfterRender = null;
        }
      },
    });
  }

  protected openPicker(): void {
    this.draft.set(toChoices(this.columns()));
    this.open.set(true);
  }

  protected toggle(key: ColumnKey): void {
    this.draft.update((choices) =>
      choices.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)),
    );
  }

  protected move(index: number, delta: -1 | 1): void {
    const choices = [...this.draft()];
    const target = index + delta;
    const item = choices[index];
    // The pinned column stays first.
    if (!item || target < 1 || target >= choices.length) {
      return;
    }
    choices.splice(index, 1);
    choices.splice(target, 0, item);
    this.draft.set(choices);

    // Keep focus on the same control for the moved item, or its sibling if that one is now
    // disabled (moved to an edge).
    const atEdge = delta < 0 ? target === 1 : target === choices.length - 1;
    const direction = atEdge
      ? delta < 0
        ? 'down'
        : 'up'
      : delta < 0
        ? 'up'
        : 'down';
    this.focusAfterRender = this.moveId(item.key, direction);
    void this.announcer.announce(
      this.translate.instant('columnPicker.moved', {
        label: this.translate.instant(columnLabelKey(item.key)),
        position: target + 1,
        total: choices.length,
      }) as string,
    );
  }

  protected resetToDefault(): void {
    this.draft.set(toChoices(DEFAULT_COLUMNS));
  }

  protected applyChanges(): void {
    this.columnsChange.emit(
      this.draft()
        .filter((c) => c.visible)
        .map((c) => c.key),
    );
    this.open.set(false);
  }

  protected moveId(key: ColumnKey, direction: 'up' | 'down'): string {
    return `${this.idPrefix}-${key}-${direction}`;
  }
}
