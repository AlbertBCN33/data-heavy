import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import {
  type ColumnKey,
  type EnumColumnKey,
  getColumn,
  getFormatters,
  type Instrument,
  type RegisteredColumn,
  type SortSpec,
} from '@data-heavy/util';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';

import { columnLabelKey, optionLabel } from '../screener-labels';
import { nextSort } from '../table/sorting';

/**
 * Baseline for performance comparisons (`?naive=1`): a plain `<table>` that renders every row.
 * Same data, formatting and sorting as the real grid; only virtualization (and, at page level, the
 * worker) are taken away. Not a product feature. See docs/performance.md.
 */
@Component({
  selector: 'dh-naive-table',
  imports: [TranslatePipe],
  templateUrl: './naive-table.html',
  styleUrl: './naive-table.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class NaiveTable {
  readonly rows = input.required<readonly Instrument[]>();
  readonly columns = input.required<readonly ColumnKey[]>();
  readonly sort = input.required<readonly SortSpec[]>();
  readonly label = input.required<string>();
  readonly locale = input('en-US');

  readonly sortChange = output<SortSpec[]>();
  readonly rowActivate = output<string>();

  protected readonly columnLabelKey = columnLabelKey;
  private readonly translate = inject(TranslateService);
  protected readonly defs = computed(() =>
    this.columns().map((key) => getColumn(key) as RegisteredColumn),
  );
  private readonly formatters = computed(() => getFormatters(this.locale()));

  protected cellText(column: RegisteredColumn, row: Instrument): string {
    const value = row[column.key];
    if (column.kind === 'enum') {
      return optionLabel(
        column.key as EnumColumnKey,
        value as string,
        this.locale(),
        (key) => this.translate.instant(key) as string,
      );
    }
    return this.formatters().cell(column.format, value, row.currency);
  }

  protected onSort(key: ColumnKey, event: MouseEvent): void {
    this.sortChange.emit(nextSort(this.sort(), key, event.shiftKey));
  }
}
