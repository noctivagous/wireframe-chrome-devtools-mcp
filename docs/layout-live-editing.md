<!-- NOTE: This doc is hand-written. The tool reference is auto-generated. -->

# layout_live_editing (V1)

`layout_live_editing` is a parametric layout generator for live browser editing. It composes three layers:

- **Layout atoms** (`layout_parametric_grid`, `layout_parametric_stack`)
- **Behavior modules** (`behavior_selectable`, `behavior_roving_focus`, `behavior_aria_pattern`, `behavior_drag_resize`)
- **Parametric components** (`component_parametric_viewer`)

Named outcomes like tabs or keyboards are **recipes** (parameter bundles), not hard-coded control names.

## Recipes (Presets)

Recipes expand to generic compositions and behaviors:

- `selectable_view`: `component_parametric_viewer` + `behavior_selectable` + `behavior_roving_focus` + `behavior_aria_pattern(tabs)`
- `parametric_grid`: `layout_parametric_grid` with rows/spans/gaps
- `overlay_grid`: `layout_parametric_grid` with overlay layers
- `app_shell`: header/sidebar/main scaffolding
- `toolbar`: grouped button row
- `grid_canvas`: grid-based canvas for timeline/piano-roll layouts

Recipes are convenience layers with **generic names and purposes** that compile to the same underlying atoms and behaviors.

### Recipe Catalog

Use `layout_live_editing_recipe_catalog` to list available recipes and their parameter summaries without bloating tool instructions.

## Tool Shape (V1)

Provide either a `recipe` or an explicit `composition`.

```json
{
  "recipe": "selectable_view",
  "recipeParams": {
    "items": [
      { "label": "Home", "content": "<div>Home</div>" },
      { "label": "About", "content": "<div>About</div>" }
    ],
    "orientation": "horizontal"
  },
  "target": {
    "selector": "#app",
    "position": "beforeend"
  },
  "patch": {
    "patchIdPrefix": "layout-tabs-001",
    "replaceExisting": true,
    "recordToSession": true
  }
}
```

Explicit composition example:

```json
{
  "composition": {
    "type": "layout_parametric_grid",
    "params": {
      "rows": [
        { "items": ["Q", "W", "E", "R", "T"] },
        { "items": ["A", "S", "D", "F"] }
      ],
      "unit": "1fr",
      "gap": "0.25rem"
    }
  },
  "behaviors": [
    { "type": "behavior_selectable", "params": { "onActivate": "insertTextIntoActiveInput" } }
  ]
}
```

`component_parametric_viewer` supports `variant: "tabs"` or `variant: "carousel"` for different layouts.

### Nested Compositions

Items can include a nested `composition` instead of raw HTML. This enables fully structured layout trees without embedding HTML strings.

## Utility Classes

Generated components include stable utility classes for styling overrides:

- `${classPrefix}-util-btn` (button base)
- `${classPrefix}-util-btn-primary` (accent button)
- `${classPrefix}-util-surface` (panel/surface)
- `${classPrefix}-util-panel` (panel with padding)
- `${classPrefix}-util-toolbar` / `${classPrefix}-util-toolbar-group`
- `${classPrefix}-util-muted` (muted text)

## Theme & Style Matching

Theme parameters now support higher-level intents and palette overrides:

```json
{
  "theme": {
    "surfaceIntent": "industrial",
    "interactionModel": "precision",
    "visualWeight": "skeuomorphic",
    "palette": {
      "background": "#101217",
      "surface": "#1b2028",
      "accent": "#4a90e2",
      "text": "#e5e7eb"
    },
    "auto": true
  }
}
```

- `auto: true` samples the target container for background/text/button colors.
- Auto sampling ignores transparent colors and walks up the DOM to find a usable background.
- Accent buttons get a contrast-aware text color via `--{prefix}-accent-contrast`.
- `surfaceIntent` seeds defaults (`industrial`, `system`, `utility`, `glass`).
- `interactionModel` sets control sizing (`precision`, `touch`, `kiosk`).
- `visualWeight` sets depth (`flat`, `skeuomorphic`, `elevated`).

## Modes

- `apply` (default): inject DOM/CSS/JS patches into the live page.
- `preview`: apply then rollback patches (useful for quick visualization).
- `export_only`: generate HTML/CSS/JS strings without touching the page.

## Patch + Edit Session Integration

- Generated HTML/CSS/JS is patch-tagged (`data-mcp-patch-*`).
- Use `patch.patchIdPrefix` + `replaceExisting` for idempotent updates.
- Use `patch.recordToSession` + `patch.editSessionId` to journal changes.

## Notes

- The V1 schema is defined in `src/tools/layout-live-editing.ts`.
- This doc is the canonical hand-written reference until the tool is fully implemented and the generator is wired in.

