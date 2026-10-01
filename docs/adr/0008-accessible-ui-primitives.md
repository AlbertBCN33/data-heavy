# 0008. Accessible UI primitives without a component library

- Status: Accepted
- Date: 2026-10-01

## Context

The app needs a handful of interactive primitives (button, dialog/drawer, multi-select, toast,
skeleton) that must meet WCAG 2.2 AA, stay small (initial JS budget), and be easy to theme. Options:

| Option                                   | Pros                                                                                                     | Cons                                                                                                                                                   |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Angular Material                         | Complete, accessible, well tested                                                                        | Material look and theming system to work around. More CSS and JS than five primitives need. Hides the accessibility work this project is meant to show |
| Hand-rolled ARIA everywhere              | Full control                                                                                             | Combobox and listbox keyboard and ARIA behaviour is easy to get subtly wrong and expensive to test                                                     |
| **Native elements + Angular Aria + CDK** | Native semantics where the platform has them, the Angular team's headless ARIA patterns where it doesn't | We own styling and a few behaviours (focus return, timers)                                                                                             |

## Decision

Build the primitives in `@data-heavy/ui`, choosing the lowest-level solution that is still correct:

| Primitive         | Built on                                        | Why                                                                                                                                                  |
| ----------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dhButton`        | Native `<button>`/`<a>` (attribute selector)    | Native keyboard, form and role semantics. `loading` keeps focus (`aria-disabled`, not `disabled`) and swallows clicks in the capture phase           |
| `dh-dialog`       | Native `<dialog>` + `showModal()`               | Top layer, inert background, focus containment and Escape for free. We add focus return, backdrop close and a drawer variant                         |
| `dh-multi-select` | `@angular/aria` combobox + listbox, CDK overlay | Follows the angular.dev multiselect guide (`aria-activedescendant`, explicit selection). Public API with no developer-preview markers in 22.2        |
| Toasts            | `ToastService` (signals) + `dh-toast-outlet`    | Live regions exist before content arrives. Errors are assertive, the rest polite. Timers pause on hover/focus (WCAG 2.2.1). Toasts never steal focus |
| `dh-skeleton`     | Plain element, `aria-hidden`                    | Sized like the real content (no CLS). Loading state is announced by the container, not by each placeholder                                           |

Conventions:

- `ui` has no i18n dependency. Every user-visible string (close, dismiss, region labels) is an
  input, so features pass translated text.
- Styling uses CSS custom properties with fallbacks. The app defines the tokens. Control borders
  use a dedicated `--dh-control-border` token at ≥ 3:1 contrast (WCAG 1.4.11). Decorative dividers
  may be lighter.
- Animations stop under `prefers-reduced-motion`.
- Unit tests use real DOM and, where available, the Angular Aria test harnesses. jsdom lacks
  `showModal()` and `scrollIntoView()`, so `ui`'s test setup polyfills just those. Real focus and
  top-layer behaviour is verified by Playwright when features use the primitives.

## Consequences

- `@angular/cdk` and `@angular/aria` are dependencies (the CDK is needed anyway for virtual
  scrolling). Both are tree-shaken: the initial bundle only contains what the shell uses
  (61 kB transferred after adding the toast outlet).
- No ready-made design system. Every new primitive costs design and testing time, which is
  acceptable for a small, fixed set.
- Native `<dialog>` depends on modern browsers (supported since 2022 in all evergreen browsers),
  which matches Angular 22's own browser support.

## Addendum (milestone 7): toasts inside modal dialogs

A modal `<dialog>` makes the rest of the page inert, including the page's toast outlet, so toast
actions (Undo, Retry) could not be reached while the drawer was open. A popover shown above the
modal is inert as well (verified in Chromium). Each open `dh-dialog` now renders its own toast
outlet, and the page outlet holds toasts back while any modal is open (`ModalStack`). Toast
labels come from a `TOAST_LABELS` token so every outlet shares the same translated text. See
[ADR 0013](0013-optimistic-watchlist-and-offline-support.md).
