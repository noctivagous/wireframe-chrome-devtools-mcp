# `layout_live_editing`: Layout Generation + Live Editing Tool (HTML/CSS/JS) — Design & Feasibility Report

**Date:** 2026-01-24  
**Author:** Research Report - AI Assistant  
**Topic:** Proposed `layout_live_editing` tool for rapidly generating UI layouts (HTML/CSS/JS with optional interactivity) inside the live browser, aligned with Wireframe Chrome DevTools MCP edit-session workflows.

---

## Executive Summary

`layout_live_editing` is a **high-leverage** addition to this repo: a single tool call can generate **structured HTML**, **scoped CSS**, and optional **JS behaviors** (selection, focus management, toggles, transitions), while recording changes into **edit sessions** for later export/commit. This matches the project philosophy that the browser is a “JIT execution environment” and file writes happen only on explicit commit/export.

**Why now:** modern UI building relies heavily on *pre-made components and scaffolds* (page builders, design-to-code tools, component kits). A first-party layout generator tool can bridge:

- **Low-level layout primitives**: Grid/Flex/Absolute/Stacking, spacing, proportions
- **Mid-level patterns**: rows/columns, split panes, tab bars, toolbars, cards
- **High-level components/scaffolds**: “page hero + features”, “app frame scaffolds”, “parametric grids” (keyboard/piano/tilepads)

**Feasibility:** High. The repo already has the core insertion and export building blocks:

- `insert_css` (with patch IDs and optional edit session recording)
- `insert_js`
- `manipulate_dom`
- `export_prototype_state` (exports DOM + injected CSS/JS patches)

The recommended implementation is a **meta-tool** that compiles a layout spec into a small set of DOM/CSS/JS patches, reusing existing patch IDs and edit-session journaling.

---

## What We Found (External Reference Points)

### 1) “Visual builder → export HTML/CSS/JS” is a proven pattern

Tools like **GrapesJS** explicitly support drag/drop composition and **HTML/CSS/JS export**, including component-attached scripts (with caveats about external dependencies) ([GrapesJS SDK](https://grapesjs.com/sdk), [Components & JS](https://grapesjs.com/docs/modules/Components-js.html)).

**Takeaway:** `layout_live_editing` should produce export-friendly output: clean DOM, scoped classes, patch-tagged `<style>`/`<script>` to work with `export_prototype_state`.

### 2) Component-first “premade UI” is the norm now

The modern ecosystem favors **reusable component kits** (e.g. shadcn/ui’s copy-paste components built from primitives) over handcrafting everything ([shadcn/ui](https://ui.shadcn.com/)).

**Takeaway:** the tool should expose *component/scaffold presets* and “tokens” (spacing/typography/radius) so generated UI can match today’s expectations quickly.

### 3) Advanced “desktop-like” layouts exist (multi-panel docking/splits)

Frameworks like **GoldenLayout** provide a docking/splittable window manager for webapps (often including tabstrips) ([GoldenLayout](https://golden-layout.com/), [GitHub](https://github.com/golden-layout/golden-layout)).

**Takeaway:** include a “desktop GUI” scaffold tier: tabstrips + split panes + resizable panels. Even a subset is valuable for rapid mockups.

### 4) External layout engines exist, but the browser already *is* the layout engine

**Yoga** is a cross-platform flexbox layout engine with JS bindings ([Yoga](https://github.com/facebook/yoga), [npm yoga-layout](https://www.npmjs.com/package/yoga-layout)). Constraint solvers like **Cassowary** enable AutoLayout-style constraint systems in JS ([cassowary.js](https://github.com/slightlyoff/cassowary.js/), [autolayout.js](https://ijzerenhein.github.io/autolayout.js/)).

**Takeaway:** we likely do **not** need to embed a full layout engine for MVP. Prefer emitting **standard CSS** (Grid/Flex) and using the browser’s native layout. Constraint-solving can be an optional “advanced mode” later.

### 5) Parametric grids are realistic as *grid + proportions + overlays*

The “onscreen keyboard in one call” requirement is best understood as: the tool supports a **general parametric grid** (units, spans, gaps, proportions), plus optional **overlay layers** for offset/stacked elements.

- A QWERTY-style keyboard is essentially a grid of keys with row-specific proportions/spans and gaps (illustrative: [DEV: Keyboard display using CSS Grid](https://dev.to/gksander/a-keyboard-display-using-css-grid-2k2n)).
- A piano is the *same idea* but with “black keys” (accidentals) that are **shorter** and **offset**, typically implemented as an overlay layer positioned relative to the white keys (examples show both grid-based and absolute-position overlays, e.g. [CodePen: Piano keys using grid](https://codepen.io/clkent/pen/dQwGqj), and discussion of flexible layouts with absolute-position black keys over white keys: [StackOverflow: flexible piano keyboard HTML/CSS](https://stackoverflow.com/questions/29656280/how-to-create-a-completely-flexible-piano-keyboard-with-html-and-css)).

**Takeaway:** make “keyboard” a **parameterization** of a more general **parametric grid** abstraction (grid + spans + overlay tracks), so the same API can produce keyboards, pianos, keypads, launchpads, etc.

---

## Web Platform Capabilities Worth Baking In (MDN)

`layout_live_editing` should optionally generate richer “modern” behavior using standard platform APIs:

- **Transitions** (simple state changes via CSS): [MDN CSS Transitions](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Transitions)
- **Web Animations API** (programmatic timelines, scrubbing, choreographed effects): [MDN Using Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API)
- **View Transitions API** (transition between document states/routes): [MDN View Transitions](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/View_transitions)
- **Container Queries** (responsive components without global breakpoints): [MDN Container Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries)

---

## Fit With This Repo (Architecture + Workflow)

This repo’s strongest differentiator is **browser-first live iteration** plus **edit session journaling**. `layout_live_editing` should follow these constraints:

- **No filesystem writes by default**: output is applied in the live browser and optionally recorded to an edit session.
- **Patches must be exportable**: `export_prototype_state` looks for MCP patch `<style>` and `<script>` tags and exports them (and exports the live DOM state).
- **Stable patch IDs**: tool should provide deterministic/stable patch IDs (or accept user-provided IDs) so repeated calls can update/replace cleanly.

Recommended internal implementation strategy:

- Generate and apply:
  - **DOM patch**: insert/update a single root container (`<div id="mcp-layout-root">` or user selector)
  - **CSS patch**: one scoped `<style>` tag (or per-component patches if needed)
  - **JS patch**: optional, for interactions (tabs, keyboard events, toggles)
- Optionally:
  - record changes to edit session (`recordToSession: true`)
  - include a verification snapshot (wireframe/SVG) after applying for quick feedback

---

## Proposed Tool: Parametric Components + Behavior Modules (to avoid “God tool” schemas)

To keep the tool easy for agents/users to wield, center it around:

- **Parametric layout components**: generic building blocks (grid/stack/overlay/regions) with proportions and tokens.
- **Behavior modules**: attachable behaviors (selection, roving focus, disclosure, drag-resize) that add semantics/interactivity without introducing bespoke “control names”.

This makes specific outcomes (tabs, piano, keyboard, dashboards) **recipes** composed from generic components + behaviors, rather than hard-coded one-offs.

### Naming + layering proposal (recommended)

**Recommendation:** Make this the explicit **V1 goal** for `layout_live_editing`.

One practical way to keep this generic (like `parametric_grid`) while still enabling turnkey outcomes is to explicitly separate layers by prefix:

#### 1) Parametric building blocks (layout atoms)

These are the “always safe” primitives that compile cleanly to CSS layout:

- `layout_parametric_grid`: grid scenarios (units, spans, gaps, proportions, optional overlays)
- `layout_parametric_stack`: stacking scenarios (direction, gap, alignment, wrapping)

Common follow-ons that stay generic (not required on day 1, but likely soon):

- `layout_parametric_overlay`: layered/anchored overlays (z-index stacking + anchor rules)
- `layout_parametric_regions`: named regions/slots (header/sidebar/content/etc.) for scaffolding without hard-coding “shell”
- `layout_parametric_split`: resizable split (with optional drag-resize behavior module)

#### 2) Parametric components (compositions built from `layout_`)

These are still generic, but they bundle a frequently-used composition of layout atoms and expose a small parameter surface:

- `component_parametric_viewer`: a **generic “selectable view” container** that can yield tabstrip-like UIs, carousels, segmented controls, etc., depending on parameters + attached behaviors

Important constraint to avoid “god component” bloat:

- Keep each `component_` scoped to **one interaction family** (e.g., “selectable view”), and express variability via **parameters + behaviors**, not by accreting unrelated features.

#### 3) Behavior modules (attachable semantics + interaction)

Behaviors are what let you avoid naming specific controls while still guaranteeing correct semantics:

- `behavior_selectable` (selection state + activation)
- `behavior_roving_focus` (keyboard focus management for a set)
- `behavior_aria_pattern` (apply a specific ARIA pattern when desired, e.g., tabs semantics)
- `behavior_drag_resize` (for split panes)

With this structure:

- “Tabs” becomes a recipe: `layout_parametric_stack` + `component_parametric_viewer` + `behavior_selectable` + `behavior_roving_focus` (+ optional ARIA pattern).
- “Carousel” becomes the same family with different parameters and a different ARIA/keyboard strategy.
- “App shell” becomes `layout_parametric_regions` + stacks/grids; no special “shell” control name required.

---

## Proposed Tool: Responsibilities and Layers

### Layer 0: Output contract (always)

- Generate a **root container** and a **namespaced class prefix** (avoid collisions)
- Emit **scoped CSS** (no global resets unless requested)
- Emit optional **JS** that is:
  - idempotent (can be re-injected / replaced safely)
  - defensive (does not assume a specific framework)
  - accessible by default where possible (ARIA patterns and keyboard navigation when behaviors are enabled)

### Layer 1: Low-level parametric layout primitives

Primitive “layout ops” that are compiled to CSS:

- **Stack**: vertical/horizontal, gap, alignment, wrap
- **Grid**: template rows/cols, auto-fit/auto-fill, named areas, spans
- **Absolute**: anchor edges, inset, z-index
- **Split**: two panels, draggable divider (optional behavior module), min sizes
- **Overlay/Layer**: stacked or anchored overlay regions (optional behavior module + transitions)
- **Regions/Slots**: named containers for composition (header/sidebar/content), not “shells”

### Layer 2: Mid-level composition helpers (still generic)

Helpers that expand into L1 structures:

- `row([...], proportions, gap)`
- `column([...], proportions, gap)`
- `selectableStack(container + triggers + panel stack)` (becomes “tabs” when combined with ARIA + roving focus behavior modules)
- `toolbar(left/center/right groups)`
- `cardGrid(cards, responsive columns)`
- `formLayout(label+control alignment)`

### Layer 3: Recipes / presets (non-core; just parameter bundles)

High-value “one call” presets that cover common modern UI and legacy fixed-width GUI (implemented as compositions of generic components + behaviors):

- **Parametric grids** (keyboards, pianos, keypads, launchpads, tile grids, etc.)
- **Selectable views** (tabstrip-like UI when using selection + roving focus + ARIA pattern behaviors)
- **App frame scaffolds** (sidebar/topbar/content regions)
- **Hero + features** landing section
- **Data table with toolbar + pagination shell**
- **Modal dialog** scaffold
- **Split-pane editor** scaffold (file tree + editor + preview)

---

## Built-in Proportions (Core Requirement)

Proportions should be first-class, not an afterthought. Recommended mechanisms:

- **Fractional tracks**: `fr` units in grid
- **Weighted flex**: `flex: <weight> 1 0` + `min-width/height`
- **Fixed/auto/fit** track values: `px`, `rem`, `ch`, `minmax()`, `clamp()`
- **Token scales**:
  - spacing scale: 0, 2, 4, 8, 12, 16, 24, 32…
  - radius scale: 6, 10, 14…
  - typography scale: 12/14/16/18/24/32…

This aligns with your “built-in proportions” requirement and makes the tool able to mimic premade components.

---

## Proposed `layout_live_editing` Schema (Concrete)

This schema is designed to be “extensive behind the scenes” but usable via:

- `preset` (high-level scaffolds)
- `layout` (mid/low-level explicit spec)
- `theme/tokens` (proportions + modern polish)

The key point: the tool should accept **generic parameters** (layout units, proportions, overlays, tokens) so “keyboard”, “piano”, “tabs”, and “dashboard” are all *parameterizations / compositions* — not hard-coded one-offs.

```json
{
  "name": "layout_live_editing",
  "target": {
    "selector": "body",
    "position": "beforeend"
  },
  "root": {
    "id": "mcp-layout-root",
    "classPrefix": "mcp-le"
  },
  "mode": "apply",
  "preset": {
    "name": "<preset_name>",
    "variant": "<variant_name>",
    "params": {
      "/* preset-defined parameters */": true
    }
  },
  "layout": {
    "type": "stack",
    "direction": "column",
    "gap": 12,
    "children": []
  },
  "theme": {
    "density": "comfortable",
    "radius": 12,
    "shadow": "md",
    "colorScheme": "auto",
    "tokens": {
      "spacing": [0,2,4,8,12,16,24,32],
      "fontFamily": "ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif"
    }
  },
  "motion": {
    "transitions": true,
    "viewTransitions": "auto",
    "durationMs": 180,
    "easing": "cubic-bezier(0.2,0.8,0.2,1)"
  },
  "interactivity": {
    "enable": true,
    "patterns": ["<pattern>"]
  },
  "patch": {
    "patchIdPrefix": "layout-live-editing",
    "replaceExisting": true,
    "recordToSession": true,
    "editSessionId": null,
    "targetFilePaths": {
      "css": "prototype/styles.css",
      "js": "prototype/app.js",
      "html": "prototype/index.html"
    }
  },
  "verify": {
    "wireframeSnapshot": false,
    "svgSnapshot": true
  }
}
```

### Modes

- `apply`: apply DOM/CSS/JS patches to the live page (default)
- `preview`: apply + auto-rollback (like `insert_css` preview) + return artifacts
- `export_only`: do not modify page; return generated HTML/CSS/JS strings

---

## Design Notes for Key Scenarios

### Horizontal tabs (your example)

Recommended compilation strategy:

- DOM:
  - tabstrip row (`role="tablist"`)
  - tab buttons (`role="tab"`, `aria-selected`)
  - panels stacked (`role="tabpanel"`, hidden except active)
- Layout:
  - tabstrip: `display:flex; flex-direction:row; gap:…`
  - panel stack: `position:relative;` with panels overlayed or `display:none`
- Interactivity:
  - click/keydown left/right to switch active tab
  - optional animated indicator (CSS transitions or WAAPI)

This matches the “horizontal stack inside horizontal stack” conceptual model while staying idiomatic to browser semantics.

### Parametric grids (keyboard/piano) via grid + overlay layers

Recommended compilation strategy:

- **Base layer**: CSS Grid with “unit columns” and key spans (1u, 1.25u, 2u, etc.)
  - Rows specify proportions via per-key spans or row-level templates.
- **Overlay layer(s)**: optional positioned elements anchored to the base grid.
  - For a piano: render white keys in the base layer, then render black keys in an overlay container with either:
    - **grid-column positioning** (fine-grained unit columns) and a higher `z-index`, or
    - **absolute positioning** relative to the base keys.
- **Optional behaviors**:
  - “typing” mode: insert characters into the active input/textarea
  - for musical keys: emit events/callbacks (sound is out of scope for MVP)

---

## Safety / Quality / Consistency Requirements

### Must-haves (MVP)

- **Scoped CSS** (class prefix + root selector scoping)
- **Idempotent updates** (replaceExisting + stable patch IDs)
- **Edit-session journaling support** (recordToSession)
- **Export compatibility** (works with `export_prototype_state`)
- **Accessibility defaults** for common components (tabs, dialogs, keyboard focus)

### Should-haves (Soon)

- **Responsive variants** (container queries + breakpoint presets)
- **Motion presets** (CSS transitions + optional WAAPI)
- **Component registry** (preset name → generator function)

### Risks

- **“God tool” complexity**: one mega-schema can become hard for agents/users to wield.
  - Mitigation: keep `preset` as the primary path; allow `layout` only for advanced usage.
- **CSS collisions**: generated styles might affect the page.
  - Mitigation: strict scoping + avoid global element selectors.
- **JS side-effects**: injected JS is hard to rollback perfectly.
  - Mitigation: keep JS minimal; attach listeners under root; support “replaceExisting” that tears down prior listeners (e.g., store cleanup on `window.__MCP_LAYOUT__` keyed by patch id).

---

## Implementation Plan (Suggested)

### Phase 1 (MVP): “Preset compiler” + 2–3 flagship scaffolds

Implement `layout_live_editing` as a meta-tool that:

- compiles a preset into HTML/CSS (and optional small JS)
- applies via existing primitives:
  - DOM insertion (`manipulate_dom`)
  - CSS insertion (`insert_css`)
  - JS insertion (`insert_js`)
- supports `recordToSession`

**Phase 1 goal (recommended):** implement the “parametric building blocks + parametric components + behavior modules” structure described above, and keep any named UI outcomes as recipes/presets.

Start with these first-class building blocks:

- `layout_parametric_grid`
- `layout_parametric_stack`
- `component_parametric_viewer` (as a composition of `layout_` + behaviors; yields tabstrip/carousel-like outcomes)

### Phase 2: Low-level layout DSL exposure

Add `layout` structured spec (stack/grid/absolute) and keep `preset` as sugar on top.

### Phase 3: Advanced GUI scaffolds + constraint/engine option (optional)

If needed for “fixed print/desktop GUI” fidelity:

- optional Yoga-based precomputation, or constraint solver mode
- resizable panes, docking, etc. (borrowing ideas from GoldenLayout)

---

## Recommendation

Proceed with `layout_live_editing` as a **high-level generator tool** built on existing patch + edit-session infrastructure. Make the default path **preset-based**, with built-in proportions and modern motion/styling tokens, and validate the core promise on a small set of representative layout families (tabs, parametric grids, dashboard shells).

---

## References

- GrapesJS SDK (export + component system): `https://grapesjs.com/sdk`  
- GrapesJS “Components & JS” (component-attached script behavior): `https://grapesjs.com/docs/modules/Components-js.html`  
- GoldenLayout (tabbed/docking layouts): `https://golden-layout.com/`, `https://github.com/golden-layout/golden-layout`  
- Yoga layout engine (flexbox algorithm): `https://github.com/facebook/yoga`, `https://www.npmjs.com/package/yoga-layout`  
- Cassowary.js (constraint solver): `https://github.com/slightlyoff/cassowary.js/`  
- autolayout.js (AutoLayout/VFL on Cassowary): `https://ijzerenhein.github.io/autolayout.js/`  
- shadcn/ui (modern premade component approach): `https://ui.shadcn.com/`  
- MDN View Transitions: `https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/View_transitions`  
- MDN Web Animations API: `https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API/Using_the_Web_Animations_API`  
- MDN Container Queries: `https://developer.mozilla.org/en-US/docs/Web/CSS/Guides/Containment/Container_queries`  
- CSS Grid keyboard example (illustrative): `https://dev.to/gksander/a-keyboard-display-using-css-grid-2k2n`  
- Piano layout examples (grid / overlay patterns): `https://codepen.io/clkent/pen/dQwGqj`, `https://stackoverflow.com/questions/29656280/how-to-create-a-completely-flexible-piano-keyboard-with-html-and-css`  
- Piano “black keys offset” discussion (illustrative): `https://dev.to/madsstoumann/piano-chords-in-css-4jop`


