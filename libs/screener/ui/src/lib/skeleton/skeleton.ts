import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type SkeletonShape = 'text' | 'rect' | 'circle';

/**
 * Placeholder shown while content loads. Give it the exact size of the content it stands in for,
 * so swapping it out causes no layout shift.
 *
 * Skeletons are decorative (`aria-hidden`); the loading container is responsible for exposing
 * the state, e.g. `aria-busy="true"` on the region.
 */
@Component({
  selector: 'dh-skeleton',
  templateUrl: './skeleton.html',
  styleUrl: './skeleton.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'aria-hidden': 'true',
    '[class]': '"dh-skeleton--" + shape()',
    '[style.inline-size]': 'width()',
    '[style.block-size]': 'height()',
  },
})
export class Skeleton {
  readonly shape = input<SkeletonShape>('text');
  /** Any CSS length, e.g. `'6rem'` or `'100%'`. */
  readonly width = input('100%');
  readonly height = input('1em');
}
