# 0013. Optimistic watchlist and offline support

- Status: Accepted
- Date: 2026-10-01

## Context

Users add and remove instruments from a watchlist. Behind `MarketDataPort` this is a remote write
(simulated with latency and failures via `?sim=1`). Waiting for each round-trip makes the UI feel
slow; ignoring failures loses data silently. The app should also keep working without a
connection: the data is static, so there is no reason for a blank page offline.

## Decision

**Optimistic updates with an ordered queue** (`WatchlistStore` in `data-access`):

- The store keeps the _confirmed_ list and a queue of pending operations. The UI reads
  `confirmed + pending`, so a change shows instantly.
- Operations are sent **one at a time, in order**, so the confirmed list never diverges from
  what the backend applied (add-then-remove of the same item cannot be reordered).
- A failed operation is dropped from the queue. That _is_ the rollback: the view recomputes
  without it. A `failed` event says whether retrying can help (`network`) or not (`invalid-data`).
- Every operation carries its **inverse** (computed when requested), so Undo restores a removed
  item to its original position (`addToWatchlist(id, position)`).
- The store emits domain events (`saved`, `failed`, `queued`, `synced`) instead of showing
  toasts. `data-access` stays independent of `ui`, and one notifier in `feature-watchlist`
  gives every feature the same feedback (Undo, Retry) without features importing each other.

**Offline:**

- `NetworkStatus` exposes `navigator.onLine` plus the online/offline events as a signal. It is a
  hint only. Requests can still fail while "online" and are handled as failures.
- While offline, operations stay pending, are persisted to an **outbox** in local storage
  (surviving reloads), and are replayed in order on reconnect. A request that fails because
  the connection dropped mid-flight is kept, not rolled back. The user is told "saved when you
  reconnect" and then "back online: n changes saved".
- The **Angular service worker** (`@angular/service-worker`, production builds only) prefetches
  the app shell and all JS chunks, and caches the market data snapshot on first use. A reload
  while offline serves the full app with data. New versions are downloaded in the background;
  the user gets a "Reload" toast instead of code changing under them.
- The shell shows an offline banner in an always-present `role="status"` region.

**Toasts and modal dialogs:** a modal `<dialog>` makes the rest of the page inert, so toast
actions (Undo, Retry) were unreachable while the detail drawer was open (caught by an e2e
test). Popovers shown above a modal are inert too (verified in Chromium). Each open `dh-dialog`
therefore renders its own toast outlet, and the page outlet holds toasts back while a modal is
open (`ModalStack`), so nothing is shown or announced twice.

## Consequences

- Changes feel instant, failures are visible and reversible, and offline changes are not lost.
- Conflict resolution is last-writer-wins per operation, acceptable for a single-user list. A
  multi-device watchlist would need versioning on the backend.
- The initial bundle grew by 5 kB transferred (87.9 kB to 93.0 kB) for the service worker client,
  navigation and network status together. The service worker also makes debugging less direct; it is
  disabled in development, and `ngsw.json` is generated at build time.
- e2e covers optimistic add, undo-to-position, rollback with retry (writes forced to fail),
  offline queue and sync, and an offline reload served by the service worker.
