import {
  DestroyRef,
  DOCUMENT,
  inject,
  Injectable,
  signal,
} from '@angular/core';

/**
 * Whether the browser believes it is online. `navigator.onLine` can report `true` on a network
 * without internet access, so this is a hint for the UI and for queuing writes, not a guarantee:
 * requests can still fail and are handled as errors.
 */
@Injectable({ providedIn: 'root' })
export class NetworkStatus {
  private readonly window = inject(DOCUMENT).defaultView;
  private readonly state = signal(this.window?.navigator.onLine ?? true);

  readonly online = this.state.asReadonly();

  constructor() {
    const win = this.window;
    if (!win) {
      return;
    }
    const update = () => this.state.set(win.navigator.onLine);
    win.addEventListener('online', update);
    win.addEventListener('offline', update);
    inject(DestroyRef).onDestroy(() => {
      win.removeEventListener('online', update);
      win.removeEventListener('offline', update);
    });
  }
}
