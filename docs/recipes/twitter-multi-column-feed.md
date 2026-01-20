# Recipe: “Twitter had a multi-column feed” (best-effort)

This is a concrete example of the interactive preview loop: apply a CSS idea, compare variants, capture evidence, and record a chosen patch for later commit.

**Note:** Twitter/X markup is frequently changing; selectors below are best-effort. If a selector matches nothing, adjust it using `take_snapshot` + element inspection.

## 1) Start an edit session

- Call `begin_edit_session` with a label like `"twitter multi-column feed"`.

## 2) Navigate and scope the feed container

- Navigate with `navigate_page` (or select an existing page with `list_pages` + `select_page`).
- Identify a stable feed root selector (examples seen historically):
  - `main [data-testid="primaryColumn"]`
  - `main [aria-label="Timeline: Your Home Timeline"]`
  - `main section[role="region"]`

## 3) Preview multi-column layout via `insert_css_preview`

Goal: make the feed container lay out cards into columns (masonry-like is harder; start with classic CSS columns).

Use a property-based preview to compare variants:

- **selector**: the chosen feed root selector (e.g. `main [data-testid="primaryColumn"]`)
- **property**: `"column-width"` (or `"column-count"`)
- **values**: e.g. `["340px", "420px", "520px"]`
- **autoRollback**: keep default `true` while experimenting
- **recordToSession**: `true`
- **targetFilePath**: where you want to keep the snippet later (e.g. a local user stylesheet)
- **selectedValueIndex**: pick the variant you want recorded (otherwise the last one is recorded)

After the preview, you’ll get per-variant wireframe SVG output so you can compare layouts quickly.

## 4) Optional: add “card” hygiene (gap/margins) as a second preview

If the feed cards need spacing tweaks, preview a second property against the card selector (best-effort examples):

- `article`
- `div[data-testid="cellInnerDiv"] article`

Try `margin-bottom` values like `["8px", "16px", "24px"]`.

## 5) End-of-session export/commit

When you’re done iterating:

- **Export**: `export_edit_session` (JSON) for review/sharing, and/or
- **Commit**: `commit_edit_session_to_files` (append-only) to write recorded `cssText` to the `targetFilePath` you provided.

If you kept any patches applied (e.g. `autoRollback: false`), clean up with `rollback_patch` or `rollback_all`.


