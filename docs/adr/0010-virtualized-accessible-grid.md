# 0010. Virtualized, accessible data grid

- Status: Accepted
- Date: 2026-10-01

## Context

The screener table shows 10k+ rows. Rendering every row would mean 100,000 elements (10,000 rows × a row and 9 default cells). Virtualization keeps only the visible rows in the DOM, which removes information assistive
technology relies on (how many rows there are, where you are) and breaks naive keyboard
navigation (the next row may not exist in the DOM yet).

Options for the table:

| Option                                     | Notes                                                                                                                                        |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Native `<table>` + CDK virtual scroll      | Native semantics, but virtualizing a `<table>` needs spacer rows and fights table layout. Sticky header and column are harder                |
| `@angular/aria` grid                       | Official keyboard and ARIA behaviour, but it manages navigation over the rows it can see in the DOM. It is not designed for virtualized rows |
| **ARIA grid on divs + CDK virtual scroll** | Full control over virtualization, layout and focus. We own the keyboard model                                                                |

## Decision

A `role="grid"` built from divs with CSS grid columns, virtualized with `@angular/cdk/scrolling`:

- **Size and position.** `aria-rowcount` is the full count (rows + header) and each rendered row has
  `aria-rowindex`, so screen readers announce "row 5,312 of 10,001" while only ~40 rows exist in the DOM.
  Columns have `aria-colindex`, the symbol cell is a `rowheader`, and `aria-sort` is set on the primary
  sort column only (as ARIA recommends). Secondary sort keys get visually hidden text.
- **One scroll container** (`cdkVirtualScrollingElement`) for both axes, so the header row and
  the symbol column are `position: sticky` with no scroll syncing. `scroll-padding` keeps focused
  cells clear of both.
- **Keyboard (WAI-ARIA grid pattern).** A single tab stop (roving `tabindex`). Arrows, Home/End,
  Ctrl+Home/End and PageUp/PageDown move between cells, including the header row. Enter/Space sorts
  on a header (Shift adds a tie-breaker) or activates a row. The movement rules are a pure function
  (`grid-navigation.ts`), unit-tested per key.
- **Focus with virtualization.** Moving to an unrendered row scrolls the container by the minimum
  amount and focuses the cell once the CDK renders it. If the active cell is scrolled out of the DOM,
  the grid itself becomes the tab stop and hands focus back when entered.
- **Rows are tracked by index, not by instrument id.** With id tracking, a re-sort _moves_ row
  nodes, and a moved node loses focus. Playwright caught keyboard users being dropped onto
  `<body>` whenever results changed. Index tracking updates rows in place, which is also less DOM
  work. If results shrink below the focused row, focus is restored to the clamped active cell.
- **New results while the user is elsewhere** reset the scroll position and the tab stop to the
  top. While the user is in the grid, their position is kept.
- **Announcements.** The result count is announced once per settled result (debounced, polite).
  The visible count is not itself a live region, so it is not read twice.
- **Fixed row height** (40 px) for the fixed-size virtual scroll strategy and zero layout shift.
  Skeleton rows have the same height, and `aria-busy` is set while loading.

## Consequences

- Grid semantics, keyboard model and focus handling are our code to maintain, but they are covered
  by unit tests for the rules and Playwright journeys for real focus behaviour (`Ctrl+End` to row
  10,001 and back, sorting while focused).
- Cell text truncates with an ellipsis at fixed column widths. Full values are available in the detail drawer.
- Rows have no per-row component state, which index tracking requires. Anything stateful per
  instrument belongs in a store keyed by id.
