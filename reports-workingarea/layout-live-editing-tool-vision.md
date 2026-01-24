# `layout_live_editing` Tool: User Experience & Practical Vision

**Date:** 2026-01-24  
**Author:** Vision Report - AI Assistant  
**Topic:** What the `layout_live_editing` tool will be like in practice, based on todo #54 architecture  
**Related:** `reports/layout-live-editing.md` (design & feasibility), todo #54 (implementation plan)

---

## Executive Summary

The `layout_live_editing` tool will be a **parametric layout generator** that creates HTML/CSS/JS compositions in the live browser using a three-layer architecture: **layout atoms**, **behavior modules**, and **parametric components**. Unlike traditional UI builders that hardcode specific controls (tabs, carousels, keyboards), this tool generates layouts through **generic building blocks** that compose into named outcomes via **recipes/presets**.

**Key Differentiator:** Named outcomes like "tabs" or "piano keyboard" are **parameter bundles** (recipes), not first-class control names. This keeps the tool generic and avoids "god tool" complexity while still enabling turnkey results.

**User Experience:** A single MCP tool call can generate complex, interactive layouts with proper accessibility, keyboard navigation, and modern styling—all while automatically integrating with edit sessions and export workflows.

---

## The Three-Layer Architecture in Practice

### Layer 1: Layout Atoms (The Foundation)

**What they are:** Generic layout primitives that compile to standard CSS Grid/Flexbox.

**Available atoms:**
- `layout_parametric_grid`: Grid layouts with units, spans, gaps, proportions, and optional overlay layers
- `layout_parametric_stack`: Stacking layouts (flexbox) with direction, gap, alignment, wrapping, and proportions

**What this means for users:**
- You don't call "create a keyboard" or "create a piano"—you call `layout_parametric_grid` with parameters that describe the grid structure
- The same atom can produce keyboards, keypads, launchpads, tile grids, or any grid-based layout
- Overlay layers enable complex compositions (like piano black keys over white keys)

**Example mental model:**
```
layout_parametric_grid({
  rows: [
    { keys: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'], spans: [1,1,1,...] },
    { keys: ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L'], spans: [1,1,1,...] },
    // ...
  ],
  unit: '1fr',  // Flexible units
  gap: '0.5rem',
  overlay: []  // No overlays for simple keyboard
})
```

The same grid atom, with different parameters, becomes a piano:
```
layout_parametric_grid({
  rows: [
    { keys: ['C', 'D', 'E', 'F', 'G', 'A', 'B'], type: 'white' },
    // ...
  ],
  overlay: [
    { keys: ['C#', 'D#', 'F#', 'G#', 'A#'], type: 'black', offset: '0.5u' }
  ]
})
```

### Layer 2: Behavior Modules (The Interactivity)

**What they are:** Attachable JavaScript modules that add interaction semantics without hardcoding control names.

**Available modules:**
- `behavior_selectable`: Selection state + activation (click to select, visual feedback)
- `behavior_roving_focus`: Keyboard focus management for arrow-key navigation
- `behavior_aria_pattern`: Apply ARIA patterns (e.g., tabs semantics, listbox semantics)
- `behavior_drag_resize`: Drag-to-resize functionality (for split panes)

**What this means for users:**
- Behaviors are **composable**—you can attach multiple behaviors to the same layout
- Behaviors are **generic**—`behavior_selectable` works on any selectable set, not just tabs
- Behaviors handle **accessibility automatically**—keyboard navigation, ARIA attributes, focus management

**Example composition:**
```
component_parametric_viewer({
  layout: layout_parametric_stack({ direction: 'row', gap: '0.5rem' }),
  behaviors: [
    behavior_selectable({ multiSelect: false }),
    behavior_roving_focus({ arrowKeys: true }),
    behavior_aria_pattern({ pattern: 'tabs' })
  ]
})
```

This composition yields a **tabstrip-like UI** (horizontal row of triggers + panel stack) without ever naming "tabs" as a control. The same composition with different parameters becomes a carousel or segmented control.

### Layer 3: Parametric Components (The Compositions)

**What they are:** Pre-composed combinations of layout atoms + behaviors that yield common outcomes.

**Available components:**
- `component_parametric_viewer`: A generic "selectable view" container that can yield tabstrip-like UIs, carousels, segmented controls, etc., via parameters + attached behaviors

**What this means for users:**
- Components are still **generic**—they don't hardcode specific UI patterns
- Components are **parameterized**—the same component produces different outcomes based on parameters
- Components are **composable**—you can combine multiple components in a larger layout

**Key principle:** Named outcomes (tabs/carousel/shell/etc.) are **recipes/presets** (parameter bundles), not first-class control names. This keeps the tool generic and avoids "god tool" complexity.

---

## The Tool Call Experience

### Basic Usage Pattern

A typical tool call will look like:

```json
{
  "name": "layout_live_editing",
  "arguments": {
    "target": {
      "selector": "#app-container",
      "position": "beforeend"
    },
    "composition": {
      "type": "component_parametric_viewer",
      "params": {
        "orientation": "horizontal",
        "items": [
          { "label": "Home", "content": "<div>Home content</div>" },
          { "label": "About", "content": "<div>About content</div>" },
          { "label": "Contact", "content": "<div>Contact content</div>" }
        ]
      },
      "behaviors": [
        { "type": "behavior_selectable", "params": { "multiSelect": false } },
        { "type": "behavior_roving_focus", "params": { "arrowKeys": true } },
        { "type": "behavior_aria_pattern", "params": { "pattern": "tabs" } }
      ]
    },
    "theme": {
      "density": "comfortable",
      "radius": 8,
      "spacing": "modern"
    },
    "patch": {
      "patchIdPrefix": "layout-tabs-001",
      "replaceExisting": true,
      "recordToSession": true,
      "editSessionId": "session-123"
    }
  }
}
```

**What happens:**
1. Tool generates HTML structure (tabstrip + panels)
2. Tool generates scoped CSS (namespaced classes, no global pollution)
3. Tool generates JavaScript (selection logic, keyboard navigation, ARIA updates)
4. Tool applies patches to live browser (DOM insertion, CSS injection, JS injection)
5. Tool records changes to edit session (for later export/commit)
6. Tool returns verification (optional wireframe snapshot)

**Result:** A fully functional, accessible tabstrip appears in the browser, ready for interaction.

### Advanced Usage: Parametric Grids

For complex layouts like keyboards or pianos:

```json
{
  "name": "layout_live_editing",
  "arguments": {
    "composition": {
      "type": "layout_parametric_grid",
      "params": {
        "rows": [
          {
            "items": ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P"],
            "spans": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
            "gap": "0.25rem"
          },
          {
            "items": ["A", "S", "D", "F", "G", "H", "J", "K", "L"],
            "spans": [1, 1, 1, 1, 1, 1, 1, 1, 1],
            "gap": "0.25rem",
            "offset": "0.5u"
          }
          // ... more rows
        ],
        "unit": "1fr",
        "overlay": []
      }
    },
    "behaviors": [
      {
        "type": "behavior_selectable",
        "params": {
          "onActivate": "insertTextIntoActiveInput"
        }
      }
    ]
  }
}
```

**Result:** A functional on-screen keyboard that inserts characters into the active input/textarea when keys are clicked.

### Recipe/Preset Usage (The Convenience Layer)

For common outcomes, users can use recipes (presets) that bundle parameters:

```json
{
  "name": "layout_live_editing",
  "arguments": {
    "recipe": "tabs",
    "recipeParams": {
      "items": [
        { "label": "Home", "content": "..." },
        { "label": "About", "content": "..." }
      ],
      "orientation": "horizontal"
    }
  }
}
```

**What happens internally:**
- Recipe expands to: `component_parametric_viewer` + `behavior_selectable` + `behavior_roving_focus` + `behavior_aria_pattern` (tabs)
- Tool generates the same output as the explicit composition above
- User gets convenience without losing the generic architecture

---

## Integration with Existing Workflows

### Edit Session Integration

The tool automatically integrates with edit sessions:

```json
{
  "patch": {
    "recordToSession": true,
    "editSessionId": "session-123"
  }
}
```

**What this means:**
- All generated HTML/CSS/JS is recorded in the edit session
- Changes can be reviewed via `get_edit_session`
- Changes can be exported via `export_prototype_state`
- Changes can be committed to filesystem when ready

### Export Compatibility

All generated patches are **patch-tagged** with `data-mcp-patch-*` attributes:

```html
<style data-mcp-patch-id="layout-tabs-001-css">
  .mcp-le-tabstrip { /* scoped styles */ }
</style>
<script data-mcp-patch-id="layout-tabs-001-js">
  // scoped JavaScript
</script>
```

**What this means:**
- `export_prototype_state` automatically includes all patches
- Patches are scoped (no global pollution)
- Patches can be replaced idempotently (`replaceExisting: true`)

### Stable Patch IDs

The tool supports stable patch IDs for idempotent updates:

```json
{
  "patch": {
    "patchIdPrefix": "layout-tabs-001",
    "replaceExisting": true
  }
}
```

**What this means:**
- First call creates patches with IDs: `layout-tabs-001-css`, `layout-tabs-001-js`, `layout-tabs-001-dom`
- Subsequent calls with the same prefix **replace** existing patches (clean teardown + rebuild)
- No accumulation of stale patches
- Safe to call repeatedly during iteration

---

## Practical Scenarios

### Scenario 1: Rapid Tabstrip Prototype

**User goal:** "Create a horizontal tabstrip with 3 tabs"

**Tool call:**
```json
{
  "recipe": "tabs",
  "recipeParams": {
    "items": [
      { "label": "Home", "content": "<h1>Home</h1><p>Welcome</p>" },
      { "label": "Products", "content": "<h1>Products</h1><p>Our offerings</p>" },
      { "label": "Contact", "content": "<h1>Contact</h1><p>Get in touch</p>" }
    ]
  },
  "recordToSession": true
}
```

**Result:** Fully functional tabstrip with:
- Click-to-switch interaction
- Arrow key navigation
- ARIA tabs semantics
- Visual focus indicators
- Smooth transitions

**Time to result:** One tool call, instant browser update

### Scenario 2: On-Screen Keyboard

**User goal:** "Create a QWERTY keyboard that types into inputs"

**Tool call:**
```json
{
  "composition": {
    "type": "layout_parametric_grid",
    "params": {
      "rows": [/* QWERTY layout definition */],
      "unit": "1fr"
    }
  },
  "behaviors": [
    {
      "type": "behavior_selectable",
      "params": {
        "onActivate": "insertTextIntoActiveInput"
      }
    }
  ]
}
```

**Result:** Functional on-screen keyboard that:
- Renders QWERTY layout
- Inserts characters into active input/textarea on click
- Supports keyboard navigation (arrow keys, Enter to activate)
- Responsive sizing

**Time to result:** One tool call, instant browser update

### Scenario 3: Piano Keyboard

**User goal:** "Create a piano keyboard with white and black keys"

**Tool call:**
```json
{
  "composition": {
    "type": "layout_parametric_grid",
    "params": {
      "rows": [
        {
          "items": ["C", "D", "E", "F", "G", "A", "B"],
          "type": "white"
        }
      ],
      "overlay": [
        {
          "items": ["C#", "D#", "F#", "G#", "A#"],
          "type": "black",
          "offset": "0.5u"
        }
      ]
    }
  }
}
```

**Result:** Piano keyboard with:
- White keys in base grid
- Black keys as overlay layer (offset, shorter)
- Proper visual stacking
- Click interaction (can emit events/callbacks)

**Time to result:** One tool call, instant browser update

### Scenario 4: App Shell Scaffold

**User goal:** "Create a basic app shell with sidebar, header, and content area"

**Tool call:**
```json
{
  "composition": {
    "type": "layout_parametric_regions",
    "params": {
      "regions": {
        "header": { "height": "3rem" },
        "sidebar": { "width": "16rem" },
        "content": { "flex": "1" }
      }
    }
  }
}
```

**Result:** App shell with:
- Named regions (header, sidebar, content)
- Responsive layout (sidebar collapses on mobile)
- Ready for content injection

**Time to result:** One tool call, instant browser update

---

## Safety & Quality Features

### CSS Scoping

All generated CSS is **scoped** to avoid collisions:

```css
/* Generated CSS uses namespaced classes */
.mcp-le-tabstrip { /* ... */ }
.mcp-le-tabstrip__trigger { /* ... */ }
.mcp-le-tabstrip__panel { /* ... */ }

/* Root selector scoping for additional safety */
#mcp-layout-root .mcp-le-tabstrip { /* ... */ }
```

**What this means:**
- No global style pollution
- Safe to use on any page
- Multiple layouts can coexist

### Accessibility Defaults

Behaviors include accessibility by default:

- **Keyboard navigation:** Arrow keys, Enter, Escape
- **ARIA attributes:** Proper roles, states, properties
- **Focus management:** Visible focus indicators, roving focus
- **Screen reader support:** Semantic HTML, ARIA labels

**What this means:**
- Generated layouts are accessible out of the box
- No need to manually add ARIA or keyboard handlers
- Meets WCAG guidelines for common patterns

### Idempotent Updates

The tool supports clean replacement of existing layouts:

```json
{
  "patch": {
    "patchIdPrefix": "layout-tabs-001",
    "replaceExisting": true
  }
}
```

**What this means:**
- First call: Creates patches
- Second call: Tears down old patches, creates new ones
- No accumulation of stale code
- Safe to iterate repeatedly

### Edit Session Journaling

All changes are recorded in edit sessions:

```json
{
  "patch": {
    "recordToSession": true,
    "editSessionId": "session-123"
  }
}
```

**What this means:**
- Changes are tracked for review
- Changes can be exported to filesystem
- Changes can be committed when ready
- Full audit trail of layout evolution

---

## Comparison to Alternatives

### vs. Hand-Coded HTML/CSS/JS

**Traditional approach:**
- Write HTML structure
- Write CSS styles
- Write JavaScript for interactivity
- Manually add ARIA attributes
- Manually handle keyboard navigation
- Test accessibility
- **Time:** 30-60 minutes for a tabstrip

**With `layout_live_editing`:**
- One tool call with parameters
- **Time:** < 1 minute

**Trade-off:** Less fine-grained control, but much faster for common patterns

### vs. Component Libraries (React, Vue, etc.)

**Component library approach:**
- Install library
- Import component
- Configure props
- Handle build/bundling
- **Time:** 10-20 minutes (if library exists)

**With `layout_live_editing`:**
- One tool call, no build step
- Works in any browser context
- **Time:** < 1 minute

**Trade-off:** No framework integration, but works everywhere

### vs. Design-to-Code Tools (Figma, Webflow)

**Design tool approach:**
- Design in tool
- Export code
- Clean up generated code
- Integrate with project
- **Time:** 20-40 minutes

**With `layout_live_editing`:**
- One tool call, live in browser
- Already integrated with edit sessions
- **Time:** < 1 minute

**Trade-off:** Less visual design control, but faster for structural layouts

---

## Limitations & Boundaries

### What the Tool Does NOT Do

1. **Visual design:** The tool generates structural layouts, not pixel-perfect designs. Styling is parametric (spacing, radius, density) but not visual design (colors, typography beyond tokens, custom graphics).

2. **Complex animations:** The tool supports basic transitions and can generate Web Animations API code, but complex choreographed animations are out of scope.

3. **Data binding:** The tool generates static HTML structures. Dynamic data binding (fetching, state management) is handled by other tools or manual code.

4. **Framework integration:** The tool generates vanilla HTML/CSS/JS. Framework-specific integrations (React components, Vue components) are out of scope.

5. **Responsive breakpoints:** The tool supports container queries and can generate responsive layouts, but complex breakpoint strategies are limited to parametric options.

### What the Tool DOES Do

1. **Structural layouts:** Grids, stacks, regions, overlays
2. **Common interactions:** Selection, keyboard navigation, ARIA patterns
3. **Accessibility:** Keyboard navigation, ARIA attributes, focus management
4. **Edit session integration:** Automatic recording, export, commit
5. **Idempotent updates:** Clean replacement of existing layouts
6. **Scoped output:** No global pollution, safe for any page

---

## Future Evolution

### Phase 1 (V1 - Current Scope)

- `layout_parametric_grid` and `layout_parametric_stack` atoms
- Core behavior modules (selectable, roving focus, ARIA patterns, drag-resize)
- `component_parametric_viewer` composition
- Basic recipes/presets (tabs, keyboard, piano)
- Edit session integration
- Export compatibility

### Phase 2 (Potential Enhancements)

- Additional layout atoms (`layout_parametric_overlay`, `layout_parametric_regions`, `layout_parametric_split`)
- Additional behavior modules (`behavior_drag_drop`, `behavior_virtual_scroll`)
- Additional components (`component_parametric_form`, `component_parametric_table`)
- More recipes/presets (app shell, dashboard, modal dialog)
- Responsive breakpoint presets
- Motion/animation presets

### Phase 3 (Advanced Features)

- Constraint-based layout (optional Yoga/Cassowary integration)
- Visual design tokens (color palettes, typography scales)
- Component registry (user-defined recipes)
- Template system (parameterized HTML templates)

---

## Conclusion

The `layout_live_editing` tool will be a **high-leverage generator** that creates complex, interactive layouts in a single tool call. Its three-layer architecture (layout atoms + behavior modules + parametric components) keeps it generic and composable while enabling turnkey results through recipes/presets.

**Key value propositions:**
- **Speed:** One call creates what would take 30-60 minutes to code manually
- **Accessibility:** Built-in keyboard navigation, ARIA patterns, focus management
- **Integration:** Automatic edit session recording, export compatibility, idempotent updates
- **Flexibility:** Generic architecture supports any grid/stack-based layout pattern
- **Safety:** Scoped CSS, clean teardown, no global pollution

**Best suited for:**
- Rapid prototyping of structural layouts
- Generating common UI patterns (tabs, keyboards, app shells)
- Creating parametric layouts (grids with proportions, overlays)
- Building accessible interactive components quickly

**Not suited for:**
- Pixel-perfect visual design
- Complex choreographed animations
- Framework-specific components
- Data-driven dynamic content

The tool represents a pragmatic middle ground: fast enough for rapid iteration, generic enough to avoid "god tool" complexity, and integrated enough to fit seamlessly into the browser-first, edit-session workflow of this MCP server.

---

## References

- Todo #54: V1 implementation plan
- `reports/layout-live-editing.md`: Design & feasibility report
- Existing tools: `insert_css`, `insert_js`, `manipulate_dom`, `export_prototype_state`
- Edit session workflow: `begin_edit_session`, `get_edit_session`, `export_prototype_state`

