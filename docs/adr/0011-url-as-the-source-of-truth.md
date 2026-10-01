# 0011. The URL is the source of truth for the screener view

- Status: Accepted
- Date: 2026-10-01

## Context

Users need to share a filtered view, reload without losing it, and use Back/Forward as they
would on any site. Keeping view state in a store and syncing it to the URL creates two sources of
truth and the bugs that come with them (loops, partial syncs, stale state after Back).

## Decision

- **The URL is the only copy** of filters, sort, visible columns and the selected instrument.
  `ScreenerUrlState` decodes the router's query params into a `Signal<ScreenerView>`, and every
  change is written back through `router.navigate`. Nothing else stores the view.
- **Format.** Short, readable params: `q`, `<numeric column>=min..max` (open bounds and `2B`-style
  suffixes accepted), `<enum column>=a,b`, `sort=-changePct,symbol`, `cols=…`, `sel=EXCHANGE:SYMBOL`.
  Defaults are omitted, and params are written in a fixed order, so equal views have equal URLs.
- **History.** Filter, sort and column changes push an entry, so Back undoes them. Typing in the
  search box replaces the current entry (debounced), so Back does not replay keystrokes. Column
  reordering is applied once from a dialog, not once per move.
- **Graceful degradation.** Decoding never throws. Each invalid param (unknown column, bad range,
  unknown value) is dropped on its own, the rest of the view is kept, and the user is told once
  that some settings in the link were ignored.
- **Coexistence.** Params owned by other features (`lang`, `sim`, `rows`) are preserved on every
  write and ignored by the codec.
- **Equality.** The view signal only changes when the encoded view changes, and the query sent
  to the worker only changes when the filter/sort part changes. Selecting a row or reordering
  columns does not re-run the query.

## Consequences

- Shared links, reloads and Back/Forward all work with no extra code, and are covered by e2e tests.
- The codec is the contract for links in the wild. Renaming a column or changing the format must
  stay backward compatible, or at least degrade through the "ignored settings" path.
- URLs grow with the number of active filters. The measured worst case (every filter set, every
  option selected, all columns reordered) encodes to 728 characters, well within URL limits.
