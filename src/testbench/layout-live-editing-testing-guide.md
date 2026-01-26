# Layout Live Editing Tools - Comprehensive Testing Guide

This guide provides a systematic approach to testing all layout live editing tools, recipes, and features.

## Getting Started

To begin testing, start a new chat session and use the `layout_live_editing` tool:

```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "app_shell",
    "sidebarWidth": 240,
    "headerHeight": 56,
    "minHeight": 400,
    "showFooter": false
  }
}
```

Or use the catalog to see available recipes:

```json
{
  "name": "layout_live_editing",
  "params": {
    "catalog": {}
  }
}
```

## Testing Phases

### Phase 1: Recipe Testing (Basic Functionality)

Test each recipe with default parameters first, then with custom parameters.

#### 1. app_shell
**Purpose**: Generic app shell with header/side/main regions

**Test Cases**:
- [ ] Default parameters
- [ ] With footer enabled (`showFooter: true`)
- [ ] Custom `headerHeight`, `sidebarWidth`, `minHeight`
- [ ] Verify: vertical layout, sidebar/main side-by-side, proper heights

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "app_shell",
    "sidebarWidth": 240,
    "headerHeight": 56,
    "minHeight": 400,
    "showFooter": true,
    "footerHeight": 48
  }
}
```

#### 2. two_column
**Purpose**: Two-column layout with sidebar and main content

**Test Cases**:
- [ ] Default `sidebarWidth`
- [ ] Custom `sidebarWidth` (e.g., 300, "20%")
- [ ] Custom `minHeight`
- [ ] Verify: sidebar and main are side-by-side

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "two_column",
    "sidebarWidth": 280,
    "minHeight": 360
  }
}
```

#### 3. three_panel
**Purpose**: Three-panel layout with nav, content, inspector

**Test Cases**:
- [ ] Default `navWidth` and `inspectorWidth`
- [ ] Custom widths
- [ ] Verify: three panels side-by-side

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "three_panel",
    "navWidth": 220,
    "inspectorWidth": 280,
    "minHeight": 360
  }
}
```

#### 4. selectable_view
**Purpose**: Generic selectable view (tabs/carousel-like) with accessibility behaviors

**Parameters**:
- `labels` (required): Array of strings for tab/panel labels. Must match length of `contents`.
- `contents` (required): Array of strings for panel content. Must match length of `labels`.
- `orientation` (optional): `"horizontal"` | `"vertical"` - Orientation of the trigger list.
- `variant` (optional): `"tabs"` | `"carousel"` - Presentation variant (defaults to tabs).
- `showControls` (optional): Boolean - Whether carousel prev/next controls are shown (carousel variant).
- `showIndicators` (optional): Boolean - Whether carousel indicators are shown (carousel variant).

**Test Cases**:
- [ ] Tabs variant (horizontal/vertical)
- [ ] Carousel variant with/without controls/indicators
- [ ] Verify: selection works, panels show/hide correctly
- [ ] Verify: labels and contents arrays must have same length

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "selectable_view",
    "labels": ["Tab 1", "Tab 2", "Tab 3"],
    "contents": ["Content 1", "Content 2", "Content 3"],
    "variant": "tabs",
    "orientation": "horizontal"
  }
}
```

**Carousel Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "selectable_view",
    "labels": ["Slide 1", "Slide 2", "Slide 3"],
    "contents": ["<p>First slide content</p>", "<p>Second slide content</p>", "<p>Third slide content</p>"],
    "variant": "carousel",
    "showControls": true,
    "showIndicators": true
  }
}
```

#### 5. parametric_grid
**Purpose**: Generic grid layout recipe with rows/spans/gaps

**Test Cases**:
- [ ] With `rows` parameter
- [ ] With `itemsForAllRows` + `columnCount`
- [ ] With spans, gaps, `rowHeight`
- [ ] Verify: grid structure, spacing, alignment

**Example with rows**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "parametric_grid",
    "rows": [
      {"items": ["A", "B", "C"]},
      {"items": ["D", "E", "F"]}
    ],
    "columnCount": 3,
    "gap": "8px"
  }
}
```

**Example with itemsForAllRows**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "parametric_grid",
    "itemsForAllRows": ["A", "B", "C", "D", "E", "F"],
    "columnCount": 3,
    "gap": "8px"
  }
}
```

#### 6. overlay_grid
**Purpose**: Generic grid layout with overlay layers

**Test Cases**:
- [ ] Basic grid with overlay layers
- [ ] Piano keys example (white keys + black key overlays)
- [ ] Verify: overlays positioned correctly, z-index works

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "overlay_grid",
    "rows": [
      {"items": ["C", "D", "E", "F", "G", "A", "B"]}
    ],
    "columnCount": 7,
    "gap": "2px",
    "rowHeight": "120px",
    "layers": [
      {
        "items": ["C#", "D#", "F#", "G#", "A#"],
        "offset": {"x": "0.5fr", "y": "0px"}
      }
    ]
  }
}
```

#### 7. toolbar
**Purpose**: Generic toolbar with grouped buttons

**Test Cases**:
- [ ] Single group
- [ ] Multiple groups
- [ ] Verify: buttons grouped correctly

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "toolbar",
    "groups": [
      {"label": "File", "items": ["New", "Open", "Save"]},
      {"label": "Edit", "items": ["Cut", "Copy", "Paste"]}
    ]
  }
}
```

#### 8. grid_canvas
**Purpose**: Grid-based canvas for timeline/piano-roll style layouts

**Test Cases**:
- [ ] Default grid
- [ ] Custom `rows`/`columns`/`cellSize`
- [ ] With/without grid lines (`showGrid`)
- [ ] Verify: grid cells render correctly

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "grid_canvas",
    "rows": 8,
    "columns": 16,
    "cellSize": 24,
    "showGrid": true
  }
}
```

#### 9. classic_5_section
**Purpose**: Classic 5-section layout (holy grail) with header, footer, left sidebar, main content, and right sidebar

**Test Cases**:
- [ ] Default parameters
- [ ] Custom `headerHeight`, `leftSidebarWidth`, `rightSidebarWidth`, `footerHeight`
- [ ] Custom `minHeight`
- [ ] Verify: all 5 sections render correctly, sidebars on both sides

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "classic_5_section",
    "headerHeight": 56,
    "leftSidebarWidth": 240,
    "rightSidebarWidth": 200,
    "footerHeight": 48,
    "minHeight": 400
  }
}
```

#### 10. masonry
**Purpose**: Pinterest-style masonry grid layout with items of varying heights

**Test Cases**:
- [ ] Default items and `columnCount`
- [ ] Custom `items` array
- [ ] Custom `columnCount` (2, 3, 4, etc.)
- [ ] Custom `gap` and `minItemWidth`
- [ ] Verify: items pack efficiently, varying heights work

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "masonry",
    "items": ["Item 1", "Item 2", "Item 3", "Item 4", "Item 5", "Item 6"],
    "columnCount": 3,
    "gap": "16px",
    "minItemWidth": "200px"
  }
}
```

#### 11. centered_hero
**Purpose**: Centered content layout with optional hero section at top

**Test Cases**:
- [ ] With hero section (`showHero: true`)
- [ ] Without hero section (`showHero: false`)
- [ ] Custom `heroHeight`, `maxContentWidth`, `contentPadding`
- [ ] Verify: content is centered, hero appears when enabled

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "centered_hero",
    "showHero": true,
    "heroHeight": 400,
    "maxContentWidth": 1200,
    "contentPadding": 24
  }
}
```

#### 12. sticky_header_footer
**Purpose**: Fixed/sticky header and footer with scrollable main content area

**Test Cases**:
- [ ] Fixed header and footer (`headerSticky: false`, `footerSticky: false`)
- [ ] Sticky header and footer (`headerSticky: true`, `footerSticky: true`)
- [ ] Mixed (fixed header, sticky footer, etc.)
- [ ] Custom `headerHeight` and `footerHeight`
- [ ] Verify: header/footer stay in place, content scrolls, padding accounts for fixed elements

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "sticky_header_footer",
    "headerHeight": 56,
    "footerHeight": 48,
    "headerSticky": false,
    "footerSticky": false
  }
}
```

#### 13. mobile_bottom_nav
**Purpose**: Mobile-style layout with bottom navigation bar

**Test Cases**:
- [ ] With top bar (`showTopBar: true`)
- [ ] Without top bar (`showTopBar: false`)
- [ ] Custom `navItems` array
- [ ] Custom `navHeight` and `topBarHeight`
- [ ] Verify: bottom nav is fixed, content has proper padding, nav items render

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "mobile_bottom_nav",
    "navHeight": 56,
    "navItems": ["Home", "Search", "Profile", "Settings"],
    "showTopBar": true,
    "topBarHeight": 56
  }
}
```

#### 14. master_detail
**Purpose**: Split view with master list on left and detail panel on right

**Test Cases**:
- [ ] Without resizing (`resizable: false`)
- [ ] With resizing (`resizable: true`)
- [ ] Custom `masterWidth` and `detailMinWidth`
- [ ] Custom `defaultSplit` ratio
- [ ] Verify: master and detail panels side-by-side, resizing works when enabled

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "master_detail",
    "masterWidth": 300,
    "detailMinWidth": 400,
    "resizable": true,
    "defaultSplit": 0.3
  }
}
```

#### 15. dashboard
**Purpose**: Multi-column dashboard layout optimized for metrics and stats

**Test Cases**:
- [ ] With header (`showHeader: true`)
- [ ] Without header (`showHeader: false`)
- [ ] Custom `columns` and `rowCount`
- [ ] Custom `cardHeight` and `gap`
- [ ] Verify: grid of metric cards, proper spacing, header when enabled

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "dashboard",
    "columns": 4,
    "rowCount": 3,
    "cardHeight": 200,
    "gap": 16,
    "showHeader": true
  }
}
```

#### 16. split_screen
**Purpose**: Two equal or custom-split panels side by side

**Test Cases**:
- [ ] Horizontal orientation (`orientation: "horizontal"`)
- [ ] Vertical orientation (`orientation: "vertical"`)
- [ ] Without resizing (`resizable: false`)
- [ ] With resizing (`resizable: true`)
- [ ] Custom `splitRatio` (0.3, 0.5, 0.7, etc.)
- [ ] Custom `minPanelSize`
- [ ] Verify: panels split correctly, resizing works when enabled, orientation respected

**Example (horizontal)**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "split_screen",
    "splitRatio": 0.5,
    "resizable": true,
    "orientation": "horizontal",
    "minPanelSize": 200
  }
}
```

**Example (vertical)**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "split_screen",
    "splitRatio": 0.3,
    "resizable": false,
    "orientation": "vertical",
    "minPanelSize": 150
  }
}
```

### Phase 2: Direct Composition Types (No Recipes)

Test the three main composition types directly without using recipes.

#### 1. layout_parametric_grid
**Test Cases**:
- [ ] Basic grid with rows
- [ ] Nested compositions
- [ ] Complex row structures with different spans
- [ ] Overlay layers with fractional offsets

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "parametric_grid": {
      "type": "layout_parametric_grid",
      "rows": [
        {"items": ["Item 1", "Item 2", "Item 3"], "spans": [1, 2, 1]},
        {"items": ["Item 4", "Item 5"]}
      ],
      "columnCount": 4,
      "gap": "8px"
    }
  }
}
```

#### 2. layout_parametric_stack
**Test Cases**:
- [ ] Row and column directions
- [ ] With `wrap` enabled
- [ ] Items with fixed sizes vs flex-grow
- [ ] Nested stacks

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "parametric_stack": {
      "type": "layout_parametric_stack",
      "direction": "row",
      "gap": "16px",
      "items": [
        {"content": "Item 1", "size": "200px"},
        {"content": "Item 2"},
        {"content": "Item 3"}
      ]
    }
  }
}
```

#### 3. component_parametric_viewer
**Test Cases**:
- [ ] Tabs and carousel variants
- [ ] Nested compositions in panel content
- [ ] Custom `ariaLabel`

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "component_parametric_viewer": {
      "type": "component_parametric_viewer",
      "variant": "tabs",
      "items": [
        {"label": "Tab 1", "content": "<p>Content 1</p>"},
        {"label": "Tab 2", "content": "<p>Content 2</p>"}
      ]
    }
  }
}
```

### Phase 3: Behaviors Testing

Test each behavior type individually and in combination.

#### 1. behavior_selectable
**Test Cases**:
- [ ] Single select vs multi-select
- [ ] `defaultSelectedIndex`
- [ ] Verify: selection state, panel visibility

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "selectable_view",
    "items": [
      {"label": "Tab 1", "content": "Content 1"},
      {"label": "Tab 2", "content": "Content 2"}
    ],
    "selectable": {
      "multiSelect": false,
      "defaultSelectedIndex": 0
    }
  }
}
```

#### 2. behavior_roving_focus
**Test Cases**:
- [ ] X, Y, and both axes
- [ ] With/without `loop`
- [ ] Verify: arrow key navigation works

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "selectable_view",
    "items": [
      {"label": "Tab 1", "content": "Content 1"},
      {"label": "Tab 2", "content": "Content 2"}
    ],
    "rovingFocus": {
      "axis": "x",
      "loop": true
    }
  }
}
```

#### 3. behavior_aria_pattern
**Test Cases**:
- [ ] All patterns: tabs, listbox, menu, grid, toolbar, radiogroup
- [ ] Verify: ARIA attributes applied correctly

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "selectable_view",
    "items": [
      {"label": "Tab 1", "content": "Content 1"},
      {"label": "Tab 2", "content": "Content 2"}
    ],
    "ariaPattern": "tabs"
  }
}
```

#### 4. behavior_drag_resize
**Test Cases**:
- [ ] X, Y, and both axes
- [ ] With `minSize`/`maxSize` constraints
- [ ] Verify: drag handles work, resizing respects constraints

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "parametric_stack": {
      "type": "layout_parametric_stack",
      "direction": "row",
      "items": [
        {"content": "Left Panel"},
        {"content": "Right Panel"}
      ]
    },
    "dragResize": {
      "axis": "x",
      "minSize": "100px",
      "maxSize": "500px",
      "handleSize": 6
    }
  }
}
```

### Phase 4: CSS Mode Testing

Test CSS update modes to ensure styles are managed correctly.

#### 1. replace (default)
**Test Cases**:
- [ ] Apply layout, then apply again with different styles
- [ ] Verify: old CSS is replaced

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "app_shell",
    "patch": {
      "cssMode": "replace",
      "replaceExisting": true
    }
  }
}
```

#### 2. merge
**Test Cases**:
- [ ] Apply layout, then apply again with additional styles
- [ ] Verify: new styles merge, conflicts update

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "app_shell",
    "patch": {
      "cssMode": "merge",
      "replaceExisting": true
    }
  }
}
```

#### 3. append
**Test Cases**:
- [ ] Apply layout, then append additional CSS
- [ ] Verify: all CSS is preserved

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "app_shell",
    "patch": {
      "cssMode": "append",
      "replaceExisting": true
    }
  }
}
```

### Phase 5: Theme Testing

Test theme variations and customization options.

#### 1. surfaceIntent
**Options**: industrial, system, utility, glass

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "app_shell",
    "theme": {
      "surfaceIntent": "industrial"
    }
  }
}
```

#### 2. visualWeight
**Options**: flat, skeuomorphic, elevated

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "app_shell",
    "theme": {
      "visualWeight": "elevated"
    }
  }
}
```

#### 3. interactionModel
**Options**: precision, touch, kiosk

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "app_shell",
    "theme": {
      "interactionModel": "touch"
    }
  }
}
```

#### 4. auto theme detection
**Test Cases**:
- [ ] With/without `sampleSelector`
- [ ] Verify: colors sampled from page

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "app_shell",
    "theme": {
      "auto": {
        "sampleSelector": "body"
      }
    }
  }
}
```

#### 5. Custom palette
**Test Cases**:
- [ ] Override individual colors
- [ ] Verify: custom colors applied

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "app_shell",
    "theme": {
      "palette": {
        "accent": "#3b82f6",
        "background": "#f8fafc",
        "surface": "#ffffff"
      }
    }
  }
}
```

### Phase 6: Edge Cases & Error Conditions

Test error handling and edge cases.

#### 1. Invalid inputs
**Test Cases**:
- [ ] Missing required parameters
- [ ] Invalid parameter types
- [ ] Conflicting parameters (e.g., both `rows` and `itemsForAllRows`)
- [ ] Verify: clear error messages

#### 2. Nested compositions
**Test Cases**:
- [ ] Deep nesting (3+ levels)
- [ ] Nested grids in stacks
- [ ] Nested stacks in grids
- [ ] Verify: all levels render correctly

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "parametric_stack": {
      "type": "layout_parametric_stack",
      "direction": "column",
      "items": [
        {
          "composition": {
            "type": "layout_parametric_stack",
            "direction": "row",
            "items": [
              {
                "composition": {
                  "type": "layout_parametric_grid",
                  "rows": [{"items": ["A", "B"]}],
                  "columnCount": 2
                }
              }
            ]
          }
        }
      ]
    }
  }
}
```

#### 3. Empty/minimal content
**Test Cases**:
- [ ] Single item
- [ ] Empty items array (should fail validation)
- [ ] Verify: appropriate error handling

#### 4. Large content
**Test Cases**:
- [ ] Many rows/items (50+)
- [ ] Very wide/narrow viewports
- [ ] Verify: performance and layout correctness

### Phase 7: Integration Testing

Test integration with other tools.

#### 1. With snapshots
**Test Cases**:
- [ ] SVG snapshot after layout
- [ ] Wireframe snapshot
- [ ] Overlap analysis

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "app_shell",
    "verify": {
      "svgSnapshot": true,
      "wireframeSnapshot": true
    }
  }
}
```

Then take a detailed snapshot:
```json
{
  "name": "svg_snapshot_live_editing",
  "params": {
    "scopeSelector": "#mcp-layout-root",
    "includeOverlapAnalysis": true,
    "showOverlaps": true,
    "showLabels": true,
    "showDimensions": true
  }
}
```

#### 2. With DOM manipulation
**Test Cases**:
- [ ] Apply layout, then modify with `manipulate_dom`
- [ ] Verify: component map selectors work

**Example**:
```json
{
  "name": "manipulate_dom",
  "params": {
    "action": "set-style",
    "selector": "#mcp-layout-root",
    "properties": {
      "padding": "1rem"
    }
  }
}
```

#### 3. With CSS insertion
**Test Cases**:
- [ ] Apply layout, then add custom CSS
- [ ] Verify: CSS scoping works correctly

**Example**:
```json
{
  "name": "insert_css",
  "params": {
    "selector": "#mcp-layout-root",
    "cssText": "#mcp-layout-root { --mcp-le-accent: #3b82f6; }"
  }
}
```

#### 4. Patch management
**Test Cases**:
- [ ] `replaceExisting: true/false`
- [ ] Multiple patches with different prefixes
- [ ] Verify: patches can be rolled back

**Example**:
```json
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "app_shell",
    "patch": {
      "patchIdPrefix": "my-layout",
      "replaceExisting": true
    }
  }
}
```

### Phase 8: Regression Testing

Test the specific fixes that were implemented.

#### 1. Nested wrapper fix
**Test**: Verify `display: contents` works for nested compositions
- [ ] Nested stacks render correctly
- [ ] No layout interference from wrapper divs

#### 2. Flex behavior fix
**Test**: Verify width/height convert to flex-basis
- [ ] Sidebar with `width: 240px` uses `flex: 0 0 240px`
- [ ] Main content expands to fill space

#### 3. CSS specificity fix
**Test**: Verify direction-specific selectors work
- [ ] Column and row stacks don't conflict
- [ ] `data-le-direction` attribute present

#### 4. Unit normalization fix
**Test**: Verify numeric strings get "px" added
- [ ] `sidebarWidth: 240` becomes `240px`
- [ ] String values like `"240px"` work correctly

#### 5. CamelCase fix
**Test**: Verify `minHeight` → `min-height` conversion
- [ ] Inline styles use kebab-case
- [ ] CSS properties work correctly

## Testing Workflow

For each test:

1. **Start fresh**: Use `new_page` or navigate to `about:blank`
2. **Apply layout**: Use `layout_live_editing` with test parameters
3. **Take snapshot**: Use `svg_snapshot_live_editing` with overlap analysis
4. **Verify programmatically**: Use `evaluate_script` to check computed styles
5. **Document issues**: Note any problems or unexpected behavior

## Quick Test Checklist Template

For each recipe/feature, verify:

- [ ] Default parameters work
- [ ] Custom parameters work
- [ ] Layout structure correct (verify with snapshot)
- [ ] No overlaps (check snapshot with `includeOverlapAnalysis: true`)
- [ ] Responsive behavior (if applicable)
- [ ] Behaviors work (if added)
- [ ] Component map accurate
- [ ] CSS scoping correct
- [ ] Theme applied correctly (if used)

## Specific Things to Watch For

1. **Overlaps**: Use SVG snapshots with `includeOverlapAnalysis: true` and `showOverlaps: true`
2. **Flex behavior**: Verify items with fixed widths/heights don't collapse
3. **Nested layouts**: Verify nested compositions render correctly
4. **CSS conflicts**: Check that direction-specific selectors prevent conflicts
5. **Unit handling**: Verify numeric values get proper units
6. **Component map**: Verify selectors work for follow-up DOM manipulation
7. **CamelCase properties**: Verify inline styles use kebab-case (e.g., `min-height` not `minHeight`)

## Example Complete Test Session

```json
// 1. Start with a new page
{
  "name": "new_page",
  "params": {
    "url": "about:blank"
  }
}

// 2. Apply app_shell recipe
{
  "name": "layout_live_editing",
  "params": {
    "recipe": "app_shell",
    "sidebarWidth": 240,
    "headerHeight": 56,
    "minHeight": 400,
    "showFooter": false,
    "verify": {
      "svgSnapshot": true
    }
  }
}

// 3. Take detailed snapshot with overlap analysis
{
  "name": "svg_snapshot_live_editing",
  "params": {
    "scopeSelector": "#mcp-layout-root",
    "includeOverlapAnalysis": true,
    "showOverlaps": true,
    "showLabels": true,
    "showDimensions": true
  }
}

// 4. Verify layout programmatically
{
  "name": "evaluate_script",
  "params": {
    "function": "() => { const root = document.getElementById('mcp-layout-root'); const outerStack = root.querySelector('.mcp-le-stack[data-le-direction=\"column\"]'); return { flexDirection: window.getComputedStyle(outerStack).flexDirection, hasContentArea: !!root.querySelector('.mcp-le-stack[data-le-direction=\"row\"]') }; }"
  }
}
```

## Notes

- Always check for overlaps after applying layouts
- Verify component map selectors work for follow-up operations
- Test both recipe-based and direct composition approaches
- Document any unexpected behavior or edge cases discovered
- Test with different viewport sizes when relevant

