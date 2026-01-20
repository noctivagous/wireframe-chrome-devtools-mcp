
"show me what it would look like if..."
modifies a live page with the mcp tools
for inserting css, jss.
    --> show me what it would look like if
    twitter had a multi-column feed.


-----

## In-GUI guidance coverage (what I saw / what felt missing)

- **`wireframe_snapshot`**: guidance would help for:
  - what `selectors` vs `scopeSelector` means,
  - how `maxElements` truncation behaves,
  - recommended `stylePreset` / computed-style whitelist defaults for layout debugging.

- **Other tools (guidance mostly good, a few gaps)**:
  - `insert_css_preview`: could benefit from a note that it **auto-rolls back by default** and you can pass multiple `values` for quick A/B testing.
  - `inspect_state`: could use short examples per framework/target (what `componentSelector` expects, and typical `filter` patterns).
  - `get_network_request`: could use a note that it can **save request/response bodies to disk** via `requestFilePath` / `responseFilePath`, and that it can return the “currently selected request” if `reqid` is omitted.

---

## Wireframe snapshot tool feedback (from TodoTracker UI work)

This note captures what helped me most with `wireframe_snapshot`, why I used it vs `svg_snapshot`, and a concrete list of improvements that would make it more useful for day-to-day UI debugging (especially with Web Components like Calcite).

### What `wireframe_snapshot` was best for

- **Proving layout mechanics**: verifying computed layout semantics like `display:flex`, `flex-wrap:wrap`, and that cards had non-100% widths so they wrap into columns.
- **Targeted debugging**: scoping to a selector like `calcite-card-group.tt-todos-card-group` and inspecting descendants, without being distracted by the rest of the page.
- **Machine-checkable validation**: quickly confirming “the CSS is actually applied” vs “it still looks wrong.”

### Why use it over `svg_snapshot` (and when to use each)

- **`svg_snapshot`** is best for:
  - Quick “does this visually look sane?” checks
  - Spotting unexpected element placement/overlap at a glance
  - Visual spacing sanity checks

- **`wireframe_snapshot`** is best for:
  - Confirming *why* something is wrong (e.g., `flex-wrap` missing, `flex-basis` too large, widths stuck at 100%)
  - Confirming intended CSS rules are applied in production markup
  - Producing structured evidence for regressions (rect + computed style)

In practice: use `svg_snapshot` first to see the shape, then `wireframe_snapshot` to confirm the underlying layout and pinpoint which CSS property is the culprit.  However, note that the tool at the time
was NOT provided full information on how to use it, so we are not defining the
tool base don this.

---

## Improvements (requested + additional)

This section is specifically about wireframe_snapshot (with a few items that could also apply to svg_snapshot if you want feature parity).
Wireframe-only / most relevant: computed-style presets/whitelists, stable IDs, diffing rect+style changes, layout assertions.
Applies to both: better truncation reporting, depth/cap controls, selector-match metadata, scroll/capture ergonomics, (optional) shadow DOM support.

### 1) Built-in computed-style presets for layout debugging

Add named presets beyond “minimal/standard/debug”, e.g.:

- **preset: "layout"** (recommended default for UI debugging)
  - Include: `display`, `position`, `inset`, `top/right/bottom/left`, `z-index`
  - Flex: `flex-direction`, `flex-wrap`, `flex`, `flex-basis`, `flex-grow`, `flex-shrink`
  - Grid: `grid-template-columns`, `grid-template-rows`, `grid-auto-flow`, `grid-auto-columns`, `grid-auto-rows`
  - Alignment: `justify-content`, `align-items`, `align-content`, `place-content`, `place-items`, `place-self`
  - Spacing: `gap`, `row-gap`, `column-gap`, `margin*`, `padding*`
  - Sizing: `width`, `min-width`, `max-width`, `height`, `min-height`, `max-height`, `box-sizing`
  - Overflow: `overflow`, `overflow-x`, `overflow-y`
  - Containment: `contain`, `content-visibility`

Why: most “layout broken” bugs come down to a small subset of these properties; capturing them by default avoids guesswork and re-running snapshots.

### 2) Depth + cardinality controls to reduce truncation pain

Add optional controls like:

- `maxDepth`: limit traversal depth (or conversely, ensure deep traversal within a focused subtree)
- `maxPerSelector`: cap results per selector when multiple selectors are provided
- `maxTotal`: explicit max element cap (existing behavior) with clearer truncation reporting
- `includeDescendants`: keep, but pair with `maxDepth` so it’s predictable

Why: pages with large DOMs truncate; for component debugging we typically want “everything under this one root” reliably.

### 3) Shadow DOM support (critical for Web Components)

Add one of:

- `includeShadowDom: true` (best)
  - Traverse into open shadow roots and include nodes (with a flag indicating shadow boundary)
- or, if full traversal isn’t feasible:
  - **Expose shadow host metadata** (e.g., “this component has shadow root; internal layout not captured”)
  - **Expose key shadow-layout wrappers** (e.g., first N internal nodes) as a “shadow summary”

Why: Esri's Calcite and other Web Components often have crucial layout containers inside shadow DOM. Without this, you can confirm outer sizing but not internal constraints.

### 4) Selector match metadata

For each returned element, include:

- `matchedSelectors: string[]`

Why: when filtering by selectors (especially multiple selectors), it helps validate that filtering is doing what you think.

### 5) Diff mode for regression-friendly workflows

Add:

- `compareWith`: previous snapshot JSON
- `highlightChanged`: boolean (or just provide changed nodes)
- Return:
  - `changedElements`: nodes whose rect or selected computed styles changed
  - `addedElements` / `removedElements` (best-effort based on stable IDs)

Why: makes “did my change affect what I intended?” fast, and supports CI-ish visual/layout regression checks without full screenshots.

### 6) Stable element identifiers (better than backend node IDs)

Provide a best-effort stable id per element, e.g.:

- `stableId` derived from (in priority order):
  - element `id`
  - `data-*` attributes commonly used as identifiers
  - a structural path hash (e.g., tag + nth-child chain within the selected subtree)

Why: backend node IDs change across reloads. Stable IDs enable meaningful diffs and easier debugging.

### 7) Bounding boxes for pseudo-elements and layout artifacts (optional)

Provide options:

- `includePseudoElements: true` for `::before`, `::after`, `::marker`

Why: pseudo elements can affect layout and perceived spacing; when they matter, being able to see their boxes helps.

### 8) Better scroll + coordinate ergonomics

Add options:

- `coordinateSpace: "viewport" | "document"` (already exists; keep)
- `scrollToSelector` before capture (optional)
- `scrollToY` (optional)
- Include:
  - `scrollX`, `scrollY`
  - (optionally) `visualViewport` values if available

Why: repeating captures often needs consistent scroll positioning to make diffs meaningful.

### 9) Simple “layout assertions” helper output (optional)

If enabled, compute and return derived facts like:

- For a flex container: number of rows/columns inferred from child rects
- For a grid: inferred column count based on child rect alignment
- “Top offenders” for overflow: elements whose `right` exceeds viewport width, etc.

Why: turns raw data into immediately actionable “what broke” signals.

### 10) Performance + payload tuning controls

Add options:

- `includeComputedStyles: true|false` (exists; keep)
- `computedStyleWhitelist`: keep, but allow:
  - `computedStylePreset: "layout" | "typography" | "paint" | ...`
- `includeTextSnippets: true|false` with a length cap (e.g., for labels)

Why: keeps snapshots small and fast while still being useful for the current debugging task.

### 11) Better truncation reporting

When truncated, include:

- `truncated: true`
- `estimatedTotalElementsInScope` (if possible)
- `returnedElementCount`
- `whyTruncated` (hit cap, hit depth, hit maxPerSelector, etc.)

Why: helps decide whether to re-run with different caps or narrower selectors.

---

## Concrete example from a repo (why this mattered)

We used `calcite-card-group` for Todos/Notes grid. Calcite’s Card Group uses a wrapping flex container (`flex-wrap: wrap`) and the documentation notes the developer should manage card widths. `wireframe_snapshot` made it trivial to confirm:

- Card group container: `display:flex`, `flex-wrap:wrap`, `gap:16px`
- Each card: `flex: 1 1 352px`, `max-width: 448px`

This is exactly what you want to verify when “grid view no longer looks right”.


