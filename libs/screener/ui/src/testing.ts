// Test-only helpers for consumers of @data-heavy/ui. Import from test setup files, never from app code.

/**
 * jsdom lacks modal dialogs and scrolling. These shims mimic only what the ui components rely on
 * (the `open` attribute, the `close` event, a no-op `scrollIntoView`); real focus and top-layer
 * behaviour is covered by e2e tests.
 */
export function installJsdomPolyfills(): void {
  if (typeof HTMLDialogElement.prototype.showModal !== 'function') {
    HTMLDialogElement.prototype.showModal = function showModal(
      this: HTMLDialogElement,
    ) {
      this.setAttribute('open', '');
    };
    HTMLDialogElement.prototype.close = function close(
      this: HTMLDialogElement,
    ) {
      if (this.hasAttribute('open')) {
        this.removeAttribute('open');
        this.dispatchEvent(new Event('close'));
      }
    };
  }
  if (typeof Element.prototype.scrollIntoView !== 'function') {
    Element.prototype.scrollIntoView = () => undefined;
  }
}
