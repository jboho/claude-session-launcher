# Put style and think on the same line

## Goal

Show the Style and Think controls on one row of the launcher panel instead of two, to save vertical space.

## Current state

- `src/renderer/index.html:23-24`: Style and Think are two separate `.group` rows inside `.compose`.
- `src/renderer/panel.css:47-49`: `.group` is a flex row (48px label, then a wrapping `.row` of buttons). The window is 440px wide (`.win`, line 33).
- `src/renderer/panel.ts:96-130`: `renderDials` finds each row by id (`g-style`, `g-thinking`) and fills it with buttons. It does not depend on where the rows sit in the page.
- Each control has a single button today (`OUTPUT_STYLES` = "Concise", `THINKING_BUDGETS` = "Off", in `src/core/types.ts:64-74`), so both fit side by side.

## Changes

1. `src/renderer/index.html` (lines 23-24): wrap the Style and Think `.group` elements in one new `<div class="pair">`. Keep the existing ids and label markup, so `panel.ts` needs no change.
2. `src/renderer/panel.css` (near line 47): add a `.pair` rule: `display:flex; flex-wrap:wrap; gap:8px 18px;` (the 18px column gap is an initial value to tune by eye in the app). Let each child group size to its content (`flex:0 1 auto`). When the width runs out, Think drops under Style. It never overlaps, and the `.row` inside each group can still wrap its own buttons.
3. Nothing in `panel.ts`, `src/core/` or the Rust side changes. Click handlers, the `thinkingBudget` disabled state, and the launch preview stay as they are.

## Acceptance criteria coverage

| Criterion | How the plan meets it |
|---|---|
| Style and Think on one row | New `.pair` flex container holds both groups side by side |
| Both controls still clickable and working | Same elements and ids, so `renderDials` wiring is untouched; verified by hand (see Testing) |
| Wraps or stacks on narrow widths without overlap | `flex-wrap:wrap` on `.pair`; Think stacks under Style when space runs out |
| Spacing and alignment match the rest of the panel | Reuse `.group` (10px label gap, 48px label) and the panel's existing row gap; check alignment of the label column with the rows above by eye |
| No regression in style or think behavior | No logic change; existing `pnpm test` suite and a manual run of both controls |

## Testing

- `command pnpm build` (typecheck and asset copy). The renderer has no test harness, so this is its automated gate.
- `command pnpm test` to confirm the TS suite still passes. No new unit test: this is CSS and markup only.
- Manual, in the running app:
  - Both controls sit on one line at the default 440px width.
  - Click Concise and Off: each toggles, the launch preview updates, and a saved preset restores both.
  - Select a model where thinking is not supported: the Think button shows disabled and nothing shifts.
  - Narrow the window or add more options temporarily (for example a long label) to confirm the pair wraps without overlap.
  - Compare the label column alignment against Model, Mode and Effort in light and dark mode.

## Risks

- Label alignment: Think's label would no longer line up with the 48px label column. The plan keeps `.group` as is and puts Think's label inline, so check this by eye and adjust the gap if it looks off.
- The window is a fixed 440px, so true "narrow widths" only appear if more options are added later. The wrap rule covers that case; it cannot be seen with today's single buttons without a temporary edit.
- No data, config or backwards-compatibility effects.
