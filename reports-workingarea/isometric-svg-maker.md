# Isometric SVG Maker MCP Tool Group: Research & Design

This document outlines the design and requirements for an **MCP tool group for creating isometric SVG graphics** based on an equilateral triangle grid. The tools are designed for live editing sessions where an AI constructs objects on an isometric grid with SVG, requiring precise coordinate access, repeatable patterns, and rich metadata for LLM evaluation and scene construction.

---

## Core Concept: Equilateral Triangle Grid with Edge Point Access

### Grid Foundation

An **isometric projection** uses three axes at 120° angles to each other, creating an equilateral triangle grid when viewed from above. Unlike traditional isometric systems that only allow placement at grid vertices, this system provides **access to points along triangle edges**, enabling objects with dimensions that fall between grid intervals.

**Key Mathematical Properties:**

- **Grid Unit**: Equilateral triangles with side length `s`
- **Height of Triangle**: `h = s * √3 / 2`
- **Isometric Axes**: Three directions at 120° angles
  - **NE (Northeast)**: `(s/2, -h)` or `(s/2, -s*√3/2)`
  - **SE (Southeast)**: `(s/2, h)` or `(s/2, s*√3/2)`
  - **W (West)**: `(-s, 0)`

### Edge Point Interpolation

To support objects with fractional grid positions (e.g., a box with height 1.5 grid units), the system must calculate points along triangle edges using **barycentric coordinates** or **linear interpolation**:

- **Edge Parameterization**: For an edge between vertices `V1(x1, y1)` and `V2(x2, y2)`, a point at fraction `t` (0 ≤ t ≤ 1) is:
  ```
  P(t) = (1-t) * V1 + t * V2
  ```
- **Barycentric Coordinates**: For a point inside or on a triangle with vertices `V1`, `V2`, `V3`, coordinates `(λ1, λ2, λ3)` where `λ1 + λ2 + λ3 = 1`:
  - Point on edge `V1-V2`: `λ3 = 0`
  - Point on edge `V2-V3`: `λ1 = 0`
  - Point on edge `V3-V1`: `λ2 = 0`

This enables precise positioning of objects that don't align perfectly with grid vertices.

---

## Coordinate System Design

### Grid Coordinates

The system uses a **triangular grid coordinate system** (similar to QRS or axial coordinates):

- **Grid Position**: `(q, r, s)` where `q + r + s = 0` (redundant but useful)
- **Screen Coordinates**: Converted using isometric transformation:
  ```
  screenX = (q - r) * s/2
  screenY = (q + r) * s*√3/2
  ```

### Edge Coordinates

For points on edges, use **edge-relative coordinates**:

- **Edge Identifier**: `(triangleId, edgeIndex, t)`
  - `triangleId`: Which triangle in the grid
  - `edgeIndex`: Which edge (0, 1, or 2)
  - `t`: Fraction along edge (0.0 to 1.0)

**Example**: A box positioned at `(q=2, r=1, edgeOffset=0.3)` means:
- Base corner at grid position `(2, 1)`
- Offset 30% along the edge from that corner

---

## Required MCP Tools

### 0. `plan_isometric_object`

**Purpose**: Convert a high-level request (e.g. “make a house”) into an explicit **composition plan**: what parts exist, how they relate, and how they should be placed relative to a shared local origin. This is the “preflight” step that prevents the common failure mode: *the agent starts drawing random primitives that stack on top of each other and don’t read as a coherent object*.

**Parameters**:
- `prompt`: String (e.g. `"house"`, `"small cabin with a chimney"`)
- `style?`: Object (optional; e.g. `{palette, strokeStyle, shadingStyle}`)
- `constraints?`: Object (optional)
  - `maxParts`: Number (default: 30)
  - `targetFootprint`: Object (optional; desired size in grid units, e.g. `{width: 4, depth: 3, height: 3}`)
  - `requiredParts`: Array of Strings (optional; e.g. `["door","roof"]`)
  - `forbidParts`: Array of Strings (optional)

**Returns**: A structured plan that downstream tools can execute deterministically:
- `objectType`: String (e.g. `"house"`)
- `localOrigin`: `"center"` (recommended default)
- `footprint`: `{width, depth, height}` in grid units (overall envelope)
- `parts`: Array of parts, each with:
  - `partId`, `label`, `role` (e.g. `"roof"`, `"door"`, `"window"`)
  - `primitive`: one of the supported primitives (`box`, `pyramid`, `custom`, etc.)
  - `dimensions`: primitive dimensions in grid units
  - `localPosition`: `{gridX, gridY, z?}` relative to the object’s local origin (and optional edge offsets)
  - `appearance`: base fill/stroke + shading mode hints
  - `layerHint`: e.g. `"structure" | "detail" | "accent"`
- `assemblySteps`: ordered steps (“draw the base volume”, “add roof”, “add door/windows”, “final shading”)

**Implementation Notes**:
- This tool is intentionally “LLM-facing”: it forces explicit decomposition and sizing before drawing.
- Downstream renderers should treat the plan as a contract and remain deterministic: same plan → same SVG.

**Example (sketch)**:
```javascript
plan_isometric_object({
  prompt: "small house",
  constraints: { targetFootprint: {width: 4, depth: 3, height: 3}, requiredParts: ["roof","door"] }
})
// → { footprint: {…}, parts: [ {role:"base", primitive:"box", …}, {role:"roof", primitive:"pyramid", …}, ... ] }
```

**Example (worked): “House” plan → render → center/autofit**

This example is intentionally explicit: it shows how you avoid the failure mode where shapes pile up at the left edge and don’t read as an object.

1) **Plan (decompose first)**

```javascript
const plan = plan_isometric_object({
  prompt: "simple house with a gable roof and 2 windows",
  constraints: {
    targetFootprint: { width: 4, depth: 3, height: 3 },
    requiredParts: ["roof", "door", "window"]
  }
});
```

Example shape of the returned `plan` (abbreviated):

```javascript
// plan.parts (relative to localOrigin:"center")
[
  { partId:"base", role:"base", primitive:"box",
    dimensions:{width:4, depth:3, height:2},
    localPosition:{gridX:0, gridY:0, z:0},
    appearance:{fill:"#c9b29b", shadeMode:"gradient"} },
  { partId:"roof", role:"roof", primitive:"pyramid",
    dimensions:{baseWidth:4, baseDepth:3, height:1},
    localPosition:{gridX:0, gridY:0, z:2},
    appearance:{fill:"#8b3a2e", shadeMode:"gradient"} },
  { partId:"door", role:"door", primitive:"box",
    dimensions:{width:0.7, depth:0.1, height:1.2},
    localPosition:{gridX:0, gridY:1.05, z:0},
    appearance:{fill:"#5b3a29", shadeMode:"flat"} },
  { partId:"windowL", role:"window", primitive:"box",
    dimensions:{width:0.6, depth:0.1, height:0.6},
    localPosition:{gridX:-1.0, gridY:1.05, z:0.9},
    appearance:{fill:"#87ceeb", opacity:0.7, shadeMode:"flat"} },
  { partId:"windowR", role:"window", primitive:"box",
    dimensions:{width:0.6, depth:0.1, height:0.6},
    localPosition:{gridX:1.0, gridY:1.05, z:0.9},
    appearance:{fill:"#87ceeb", opacity:0.7, shadeMode:"flat"} }
]
```

2) **Create the canvas centered (don’t start at the left edge)**

```javascript
create_isometric_grid({
  viewBox: "0 0 800 600",
  gridSize: 50,
  autoCenter: true,
  canvasPadding: 40,
  showGrid: true
});
```

3) **Place the whole object with a single anchor**

Choose one global anchor for the house (grid-space), then add each part’s `localPosition`:

```javascript
const anchor = { gridX: 0, gridY: 0 }; // “put the house here”
const partIds = [];

for (const part of plan.parts) {
  const id = create_isometric_shape({
    shapeType: part.primitive,
    position: {
      gridX: anchor.gridX + part.localPosition.gridX,
      gridY: anchor.gridY + part.localPosition.gridY
      // z is handled by the primitive (height) and/or by face generation rules
    },
    dimensions: part.dimensions,
    fill: part.appearance.fill,
    opacity: part.appearance.opacity ?? 1,
    isSurface: true,
    groupId: "house-1",
    label: part.partId,
    metadata: { role: part.role, layerHint: part.layerHint }
  });
  partIds.push(id);
}
```

4) **Group, then run layout/autofit + z-sort**

```javascript
group_isometric_objects({
  objectIds: partIds,
  groupId: "house-1",
  label: "House",
  metadata: { type: "building", footprint: plan.footprint }
});

layout_isometric_scene({
  target: "group",
  groupId: "house-1",
  mode: "autofit",
  padding: 40
});
```

The key point: `layout_isometric_scene` is where you (a) compute bounds, (b) center the world transform so the house is visible/readable, and (c) apply a deterministic draw order, writing `data-iso-depth-key` + `data-z-index` so the ordering is inspectable.

5) **Export**

```javascript
export_isometric_svg({ filePath: "out/house.svg", includeGrid: false, includeMetadata: true });
```

### 1. `create_isometric_grid`

**Purpose**: Initialize an isometric SVG grid with configurable parameters.

**Parameters**:
- `gridSize`: Number (side length of equilateral triangles, default: 50)
- `viewBox`: String (SVG viewBox, default: "0 0 800 600")
- `origin?`: Object (optional; default centers the scene in the viewBox)
  - `x`: Number (screen-space X offset applied to the isometric world)
  - `y`: Number (screen-space Y offset applied to the isometric world)
- `sceneScale?`: Number (optional; default: `1`)
- `autoCenter?`: Boolean (default: `true`; if true, sets `origin` to the viewBox center)
- `canvasPadding?`: Number (optional; default: `40`; used by auto-fit / auto-center steps)
- `showGrid`: Boolean (render grid lines, default: true)
- `gridColor`: String (grid line color, default: "#ccc")
- `gridOpacity`: Number (0-1, default: 0.3)

**Returns**: SVG element ID and grid metadata (grid size, transformation matrix).

**Implementation Notes**:
- Creates an SVG element with appropriate viewBox
- Creates a dedicated world group (e.g. `<g id="iso-world">`) and applies `translate(origin) scale(sceneScale)` to that group, so objects are not accidentally drawn starting at the left edge.
- Optionally renders grid lines using `<path>` or `<line>` elements
- Stores grid configuration for coordinate conversion functions

---

### 2. `grid_to_screen`

**Purpose**: Convert grid coordinates (including edge points) to screen coordinates.

**Parameters**:
- `gridX`: Number (q coordinate)
- `gridY`: Number (r coordinate)
- `edgeOffset?`: Number (optional, 0-1 for position along edge)
- `edgeDirection?`: String (optional: "ne", "se", "w" for which edge)

**Returns**: `{x: number, y: number}` screen coordinates.

**Example**:
```javascript
// Grid vertex
grid_to_screen({gridX: 2, gridY: 1}) 
// → {x: 75, y: 129.9}

// Point 30% along NE edge from (2,1)
grid_to_screen({gridX: 2, gridY: 1, edgeOffset: 0.3, edgeDirection: "ne"})
// → {x: 82.5, y: 111.2}
```

---

### 3. `create_isometric_shape`

**Purpose**: Create an isometric shape with configurable type and parameters.

**Parameters**:
- `shapeType`: String (one of: "box", "ellipse", "cylinder", "sphere", "cone", "pyramid", "custom")
- `position`: Object with:
  - `gridX`: Number (grid q coordinate)
  - `gridY`: Number (grid r coordinate)
  - `edgeOffset?`: Number (optional, 0-1 for position along edge)
  - `edgeDirection?`: String (optional: "ne", "se", "w" for which edge)
- `placement?`: Object (optional; when present, helps avoid “everything stacks at (0,0)”)
  - `mode`: `"absolute" | "auto"` (default: `"absolute"`)
  - `anchor`: `"center" | "top-left" | "custom"` (default: `"center"` for `mode:"auto"`)
  - `avoidOverlap`: Boolean (default: `true` for `mode:"auto"`)
  - `spacing`: `{x: number, y: number}` in grid units (optional)
- `dimensions`: Object (shape-specific dimensions, see below)
- `fill`: String (fill color)
- `stroke`: String (stroke color, optional)
- `strokeWidth`: Number (default: 1)
- `isSurface`: Boolean (if true, render as filled surface; if false, render as wireframe)
- `opacity`: Number (0-1, default: 1)
- `rotation?`: Number (rotation angle in degrees, default: 0)
- `groupId`: String (optional, for grouping with other objects)
- `label`: String (optional, for LLM identification)
- `metadata`: Object (optional, custom metadata for LLM context)

**Shape-Specific Dimensions**:

- **`box`**: `{width: number, height: number, depth: number}` (all can be fractional)
- **`ellipse`**: `{radiusX: number, radiusY: number}` (radii along isometric axes)
- **`cylinder`**: `{radius: number, height: number}` (circular base, vertical height)
- **`sphere`**: `{radius: number}` (radius in grid units)
- **`cone`**: `{baseRadius: number, height: number}` (circular base, vertical height)
- **`pyramid`**: `{baseWidth: number, baseDepth: number, height: number}` (rectangular base)
- **`custom`**: `{pathData: string}` (custom SVG path data in isometric coordinates)

**Returns**: SVG `<g>` or element ID containing the shape.

**Implementation Notes**:
- For `box`: Calculates all 8 vertices using edge interpolation when dimensions are fractional; renders 3 visible faces (top, front, right) in isometric view
- For `ellipse`: Converts isometric ellipse to screen-space ellipse using transformation matrix; may require `<path>` with arc commands for accuracy
- For `cylinder`: Renders as isometric projection with elliptical top/bottom and rectangular sides
- For `sphere`: Renders as isometric circle with optional shading
- For `cone`: Renders as isometric projection with elliptical base and triangular sides
- For `pyramid`: Renders as isometric projection with rectangular base and triangular sides
- For `custom`: Uses provided path data directly (assumes isometric coordinates)
- If `isSurface: true`, applies shading/fill; if `false`, renders wireframe
- Adds `data-isometric-object`, `data-shape-type`, `data-group-id`, `data-label`, and `data-metadata` attributes for LLM identification
- To support placement-aware rendering, also add:
  - `data-grid-q`, `data-grid-r` (and edge offset/direction if relevant)
  - `data-iso-depth-key` and `data-z-index` (after layout/sort)

**Examples**:
```javascript
// Create a box
create_isometric_shape({
  shapeType: "box",
  position: {gridX: 2, gridY: 1},
  dimensions: {width: 2.5, height: 1.0, depth: 1.5},  // Fractional dimensions
  fill: "#4a90e2",
  isSurface: true,
  groupId: "building-1",
  label: "Main Building",
  metadata: {type: "structure", material: "concrete"}
})

// Create an ellipse
create_isometric_shape({
  shapeType: "ellipse",
  position: {gridX: 5, gridY: 3},
  dimensions: {radiusX: 1.5, radiusY: 1.0},
  fill: "#90e24a",
  rotation: 45,
  label: "Pond"
})

// Create a cylinder
create_isometric_shape({
  shapeType: "cylinder",
  position: {gridX: 0, gridY: 0, edgeOffset: 0.3, edgeDirection: "ne"},
  dimensions: {radius: 1.0, height: 2.5},
  fill: "#e24a90",
  isSurface: true,
  label: "Tower"
})
```

---

### 4. `repeat_isometric_pattern`

**Purpose**: Repeat an isometric object or pattern at regular intervals.

**Parameters**:
- `pattern`: String (SVG element ID or path data to repeat)
- `startX`: Number (grid q coordinate of first instance)
- `startY`: Number (grid r coordinate of first instance)
- `countX`: Number (number of repetitions along X axis)
- `countY`: Number (number of repetitions along Y axis)
- `intervalX`: Number (spacing in grid units along X, default: 1)
- `intervalY`: Number (spacing in grid units along Y, default: 1)
- `offsetX`: Number (optional offset in grid units)
- `offsetY`: Number (optional offset in grid units)
- `groupId`: String (optional, groups all repeated instances)
- `labelPrefix`: String (optional, e.g., "window-" for labels "window-0", "window-1", etc.)

**Returns**: SVG `<g>` element ID containing all repeated instances.

**Implementation Notes**:
- Uses SVG `<use>` elements or clones the pattern element
- Each instance gets a unique label if `labelPrefix` is provided
- All instances share the same `groupId` for collective operations

**Example**:
```javascript
repeat_isometric_pattern({
  pattern: "window-element-id",
  startX: 0,
  startY: 0,
  countX: 5,
  countY: 3,
  intervalX: 2.0,
  intervalY: 1.5,
  groupId: "windows-grid",
  labelPrefix: "window"
})
// Creates 15 windows in a 5×3 grid
```

---

### 5. `group_isometric_objects`

**Purpose**: Group multiple isometric objects into a single composite object with metadata.

**Parameters**:
- `objectIds`: Array of strings (SVG element IDs to group)
- `groupId`: String (unique identifier for the group)
- `label`: String (human-readable label)
- `metadata`: Object (structured metadata including:
  - `type`: String (e.g., "building", "vehicle", "landscape")
  - `components`: Array of objects with `id`, `label`, `role` (e.g., "wall", "roof", "door")
  - `orientation`: String (e.g., "north", "south", "45deg")
  - `dimensions`: Object with `width`, `height`, `depth`
  - `appearance`: Object with `color`, `material`, `texture` hints
  - `relationships`: Array of objects describing connections to other groups)

**Returns**: SVG `<g>` element ID containing the grouped objects.

**Implementation Notes**:
- Wraps objects in a `<g>` element with `data-isometric-group`, `data-group-id`, `data-label`, and `data-metadata` attributes
- Metadata is stored as JSON in `data-metadata` for LLM parsing
- Each component object retains its individual `data-label` and `data-component-role` attributes

**Example**:
```javascript
group_isometric_objects({
  objectIds: ["wall-1", "wall-2", "roof-1", "door-1"],
  groupId: "house-1",
  label: "Residential House",
  metadata: {
    type: "building",
    components: [
      {id: "wall-1", label: "North Wall", role: "wall"},
      {id: "wall-2", label: "South Wall", role: "wall"},
      {id: "roof-1", label: "Roof", role: "roof"},
      {id: "door-1", label: "Front Door", role: "door"}
    ],
    orientation: "north",
    dimensions: {width: 4, height: 2, depth: 3},
    appearance: {color: "#8b7355", material: "wood"},
    relationships: [{groupId: "path-1", type: "connects-to"}]
  }
})
```

---

### 6. `query_isometric_scene`

**Purpose**: Query the isometric scene for objects, groups, or metadata (for LLM evaluation).

**Parameters**:
- `queryType`: String (one of: "all", "by-group", "by-label", "by-metadata", "by-position")
- `groupId?`: String (filter by group ID)
- `label?`: String (filter by label, supports wildcards)
- `metadataFilter?`: Object (filter by metadata properties, e.g., `{type: "building"}`)
- `positionFilter?`: Object (filter by grid position, e.g., `{minX: 0, maxX: 10, minY: 0, maxY: 10}`)
- `includeComponents`: Boolean (include individual components within groups, default: true)

**Returns**: Array of objects with:
- `id`: String (element ID)
- `groupId`: String (if part of a group)
- `label`: String
- `metadata`: Object
- `position`: Object with `gridX`, `gridY`, `screenX`, `screenY`
- `bounds`: Object with bounding box in screen coordinates
- `components`: Array (if a group, lists component objects)

**Implementation Notes**:
- Parses SVG DOM to find elements with `data-isometric-object` or `data-isometric-group` attributes
- Extracts metadata from `data-metadata` attributes (JSON)
- Returns structured data for LLM to understand scene composition

---

### 7. `update_isometric_object`

**Purpose**: Update properties of an existing isometric object (position, appearance, metadata).

**Parameters**:
- `objectId`: String (element ID to update)
- `position?`: Object with `gridX`, `gridY`, `edgeOffset?`, `edgeDirection?`
- `appearance?`: Object with `fill`, `stroke`, `strokeWidth`, `opacity`
- `metadata?`: Object (merged with existing metadata)
- `label?`: String (update label)

**Returns**: Updated object metadata.

---

### 8. `export_isometric_svg`

**Purpose**: Export the complete isometric scene as a standalone SVG file.

**Parameters**:
- `filePath`: String (output file path)
- `includeGrid`: Boolean (include grid lines, default: false)
- `includeMetadata`: Boolean (include data attributes, default: true)
- `minify`: Boolean (minify SVG output, default: false)

**Returns**: File path of exported SVG.

---

### 9. `layout_isometric_scene`

**Purpose**: Run a deterministic **layout + camera** pass so the illustration is readable:
- Center the composed object(s) in the canvas (not stuck on the left edge)
- Apply consistent padding
- Optionally place multiple objects so they don’t overlap
- Produce stable DOM order (z-sorted)

**Parameters**:
- `mode`: `"center" | "autofit" | "pack"` (default: `"autofit"`)
- `padding`: Number (default: `40`)
- `target`: `"scene" | "group"` (default: `"scene"`)
- `groupId?`: String (required if `target:"group"`)

**Returns**:
- `boundsBefore`, `boundsAfter` (screen-space)
- `sceneTransform` (the applied translate/scale)
- `orderedIds` (final draw order)

**Implementation Notes**:
- Compute bounds from the scene model (preferred) or from SVG element bounding boxes.
- Apply transform to the world group (`#iso-world`) so the illustration lands centered.
- For “pack”, use a simple occupancy approach in grid-space: advance a placement cursor (e.g. along `q`/`r`) and reserve each object’s footprint.

---

## General Tool Processes

Based on real-world isometric drawing techniques and workflows, the following processes represent common patterns for constructing isometric objects and scenes using the tool set.

### 1. Box Construction Technique (Most Common)

The **box construction technique** (also called coordinate technique) is the most widely used method for creating isometric objects. It involves:

**Process Steps:**
1. **Establish Bounding Box**: Create a rectangular box that encloses the entire object
   - Use `create_isometric_shape` with `shapeType: "box"` and overall dimensions
   - This serves as a construction guide
2. **Plot Principal Dimensions**: Mark key points along the box edges
   - Use `grid_to_screen` to calculate positions for features
   - Dimensions are plotted along Height, Width, and Depth axes
3. **Draw Outer Lines**: Create the object's outer profile
   - Use the bounding box as reference
   - Draw along isometric axis directions (30° angles)
4. **Add Internal Details**: Construct internal features
   - Break complex shapes into simpler primitives
   - Use multiple `create_isometric_shape` calls for components
5. **Refine and Group**: Combine primitives into final object
   - Use `group_isometric_objects` to combine related elements
   - Each component should be self-contained and portable

**Tool Sequence Example:**
```javascript
// Step 1: Create bounding box
const boundingBox = create_isometric_shape({
  shapeType: "box",
  position: {gridX: 0, gridY: 0},
  dimensions: {width: 4, height: 3, depth: 2},
  isSurface: false,  // Wireframe for construction
  label: "bounding-box"
});

// Step 2-4: Create object components
const base = create_isometric_shape({
  shapeType: "box",
  position: {gridX: 0, gridY: 0},
  dimensions: {width: 4, height: 0.5, depth: 2},
  fill: "#8b7355",
  label: "base"
});

const walls = [
  create_isometric_shape({...}), // front wall
  create_isometric_shape({...}), // back wall
  // etc.
];

// Step 5: Group into final object
group_isometric_objects({
  objectIds: [base, ...walls],
  groupId: "building-1",
  label: "Main Building"
});
```

### 2. Primitive-Based Construction

Complex objects are built by **combining simple primitives** (cuboids, cylinders, spheres, etc.). This mirrors how professional isometric artists work.

**Process Steps:**
1. **Decompose Object**: Break the target object into primitive shapes
   - Identify: boxes, cylinders, spheres, cones, pyramids
   - Note their relative positions and sizes
2. **Create Primitives**: Build each primitive separately
   - Use `create_isometric_shape` with appropriate `shapeType`
   - Position using grid coordinates with edge offsets if needed
3. **Position and Align**: Place primitives relative to each other
   - Calculate relative positions using `grid_to_screen`
   - Use fractional coordinates for precise alignment
4. **Combine**: Group primitives into composite objects
   - Use `group_isometric_objects` with component metadata
   - Maintain individual component labels for later modification

**Tool Sequence Example:**
```javascript
// Decompose a radio into: base box, front faceplate, glass panel
const radioBase = create_isometric_shape({
  shapeType: "box",
  dimensions: {width: 3, height: 1, depth: 2},
  fill: "#333",
  label: "radio-base"
});

const faceplate = create_isometric_shape({
  shapeType: "box",
  position: {gridX: 0, gridY: 0, edgeOffset: 0.1},
  dimensions: {width: 2.8, height: 0.1, depth: 1.8},
  fill: "#666",
  label: "faceplate"
});

const glass = create_isometric_shape({
  shapeType: "box",
  position: {gridX: 0.1, gridY: 0.1, edgeOffset: 0.15},
  dimensions: {width: 2.5, height: 0.05, depth: 1.5},
  fill: "#4a90e2",
  opacity: 0.6,
  label: "glass-panel"
});

group_isometric_objects({
  objectIds: [radioBase, faceplate, glass],
  groupId: "radio-1",
  label: "Vintage Radio",
  metadata: {
    type: "device",
    components: [
      {id: radioBase, role: "base"},
      {id: faceplate, role: "face"},
      {id: glass, role: "display"}
    ]
  }
});
```

### 3. Layered Construction Workflow

Professional isometric design uses **layers** to organize different aspects of the drawing (line art, color, shading, details).

**Process Steps:**
1. **Base Layer**: Create structural elements
   - Main shapes and forms
   - Use `isSurface: false` for wireframe or `isSurface: true` with base colors
2. **Detail Layer**: Add internal details and features
   - Windows, doors, decorative elements
   - Use smaller shapes positioned relative to base
3. **Styling Layer**: Apply colors, shading, and visual effects
   - Use `update_isometric_object` to modify appearance
   - Adjust `fill`, `opacity`, `stroke` properties
4. **Group by Layer**: Organize elements into logical groups
   - Group line art, color, and shading together
   - Use `groupId` to maintain layer relationships

**Tool Sequence Example:**
```javascript
// Base layer: structure
const structureGroup = group_isometric_objects({
  objectIds: [walls, floor, roof],
  groupId: "structure-layer",
  label: "Building Structure"
});

// Detail layer: features
const detailsGroup = group_isometric_objects({
  objectIds: [windows, doors, decorations],
  groupId: "details-layer",
  label: "Building Details"
});

// Styling: update appearance
update_isometric_object({
  objectId: structureGroup,
  appearance: {fill: "#8b7355", opacity: 1.0}
});

update_isometric_object({
  objectId: detailsGroup,
  appearance: {fill: "#4a90e2", stroke: "#333", strokeWidth: 2}
});
```

### 4. Grid-Based Construction

Objects are **aligned to the isometric grid** to maintain consistent angles and proportions.

**Process Steps:**
1. **Establish Grid**: Create or reference the isometric grid
   - Use `create_isometric_grid` with appropriate `gridSize`
   - Grid lines guide object placement at 30° angles
2. **Align to Grid**: Position objects on grid vertices or edges
   - Use integer grid coordinates for grid-aligned objects
   - Use edge offsets for objects between grid points
3. **Maintain Angles**: Ensure all lines follow isometric axes
   - Objects should align to NE, SE, or W directions
   - Use `grid_to_screen` to verify alignment
4. **Snap to Grid** (optional): Round positions to nearest grid point
   - Useful for creating uniform layouts
   - Can be implemented in tool logic

**Tool Sequence Example:**
```javascript
// Create grid
const grid = create_isometric_grid({
  gridSize: 50,
  showGrid: true
});

// Create grid-aligned objects
const tile1 = create_isometric_shape({
  shapeType: "box",
  position: {gridX: 0, gridY: 0},  // On grid vertex
  dimensions: {width: 1, height: 0.2, depth: 1},
  label: "tile-0-0"
});

const tile2 = create_isometric_shape({
  shapeType: "box",
  position: {gridX: 1, gridY: 0},  // Adjacent grid vertex
  dimensions: {width: 1, height: 0.2, depth: 1},
  label: "tile-1-0"
});

// Create off-grid object (between vertices)
const object = create_isometric_shape({
  shapeType: "box",
  position: {
    gridX: 0.5,
    gridY: 0.5,
    edgeOffset: 0.3,  // 30% along edge
    edgeDirection: "ne"
  },
  dimensions: {width: 0.5, height: 1, depth: 0.5},
  label: "off-grid-object"
});
```

### 5. Iterative Refinement Process

Isometric objects are typically created through **iterative refinement**, starting rough and adding detail progressively.

**Process Steps:**
1. **Initial Sketch**: Create basic form with approximate dimensions
   - Use `create_isometric_shape` with rough measurements
   - Don't worry about perfect alignment initially
2. **Query and Evaluate**: Check current state
   - Use `query_isometric_scene` to see what's been created
   - Review positions, dimensions, and relationships
3. **Refine Dimensions**: Adjust sizes and positions
   - Use `update_isometric_object` to modify position or dimensions
   - Fine-tune using edge offsets for precise placement
4. **Add Details**: Incrementally add complexity
   - Add smaller components
   - Use `repeat_isometric_pattern` for repetitive elements
5. **Final Polish**: Apply styling and metadata
   - Update colors, opacity, strokes
   - Add comprehensive metadata for LLM understanding

**Tool Sequence Example:**
```javascript
// Step 1: Initial sketch
let building = create_isometric_shape({
  shapeType: "box",
  position: {gridX: 2, gridY: 1},
  dimensions: {width: 3, height: 2, depth: 2},  // Approximate
  fill: "#ccc",
  label: "building-draft"
});

// Step 2: Query scene
const scene = query_isometric_scene({queryType: "all"});

// Step 3: Refine
update_isometric_object({
  objectId: building,
  position: {gridX: 2, gridY: 1, edgeOffset: 0.1},
  metadata: {refined: true}
});

// Step 4: Add details (windows)
const windows = repeat_isometric_pattern({
  pattern: windowTemplate,
  startX: 2.2,
  startY: 1.2,
  countX: 3,
  countY: 2,
  intervalX: 0.8,
  labelPrefix: "window"
});

// Step 5: Final polish
update_isometric_object({
  objectId: building,
  appearance: {fill: "#8b7355", stroke: "#654321", strokeWidth: 2},
  metadata: {
    type: "building",
    material: "wood",
    finalized: true
  }
});
```

### 6. Component-Based Assembly

Complex scenes are built by **assembling pre-constructed components** that can be reused and combined.

**Process Steps:**
1. **Create Component Library**: Build reusable components
   - Windows, doors, furniture, decorative elements
   - Each component is self-contained with metadata
2. **Position Components**: Place components in scene
   - Use `create_isometric_shape` or reference existing components
   - Calculate relative positions
3. **Group Related Components**: Organize into logical units
   - Use `group_isometric_objects` to create composite objects
   - Maintain component relationships in metadata
4. **Query and Modify**: Evaluate and adjust component placement
   - Use `query_isometric_scene` to find components
   - Use `update_isometric_object` to modify positions or properties

**Tool Sequence Example:**
```javascript
// Component library
const windowComponent = create_isometric_shape({
  shapeType: "box",
  dimensions: {width: 0.8, height: 1.2, depth: 0.1},
  fill: "#87ceeb",
  label: "window-template",
  metadata: {reusable: true, type: "window"}
});

// Use component in building
const buildingWindows = repeat_isometric_pattern({
  pattern: windowComponent,
  startX: 1,
  startY: 1,
  countX: 4,
  countY: 2,
  intervalX: 2,
  groupId: "building-windows",
  labelPrefix: "window"
});

// Group building with windows
group_isometric_objects({
  objectIds: [building, buildingWindows],
  groupId: "complete-building",
  label: "Residential Building",
  metadata: {
    components: [
      {id: building, role: "structure"},
      {id: buildingWindows, role: "windows", count: 8}
    ]
  }
});
```

### 7. Workflow Summary

The typical isometric object creation workflow follows this pattern:

1. **Setup**: `create_isometric_grid` → Establish working environment
2. **Plan**: Decompose target into primitives/components
3. **Construct**: `create_isometric_shape` → Build base forms
4. **Refine**: `update_isometric_object` → Adjust dimensions/positions
5. **Detail**: `create_isometric_shape` + `repeat_isometric_pattern` → Add details
6. **Organize**: `group_isometric_objects` → Combine into composites
7. **Evaluate**: `query_isometric_scene` → Check current state
8. **Style**: `update_isometric_object` → Apply colors/styling
9. **Export**: `export_isometric_svg` → Save final result

These processes align with established isometric drawing techniques while leveraging the tool set's capabilities for AI-driven scene construction.

---

## LLM Integration & Identification Markers

### Data Attributes for LLM Evaluation

All isometric objects must include the following SVG data attributes:

- **`data-isometric-object`**: `"true"` (marks an isometric object)
- **`data-shape-type`**: Shape type (e.g., "box", "ellipse", "cylinder", "sphere")
- **`data-isometric-group`**: `"true"` (marks a group)
- **`data-group-id`**: Unique identifier for grouping
- **`data-label`**: Human-readable label for LLM identification
- **`data-metadata`**: JSON string containing structured metadata
- **`data-component-role`**: Role of component within a group (e.g., "wall", "roof", "door")
- **`data-orientation`**: Orientation hint (e.g., "north", "45deg")

### Metadata Structure

```json
{
  "type": "building|vehicle|landscape|decoration|other",
  "components": [
    {
      "id": "element-id",
      "label": "Component Name",
      "role": "wall|roof|door|window|base|other",
      "position": {"gridX": 2, "gridY": 1},
      "appearance": {"color": "#4a90e2", "material": "concrete"}
    }
  ],
  "orientation": "north|south|east|west|45deg|90deg|...",
  "dimensions": {
    "width": 4.0,
    "height": 2.0,
    "depth": 3.0
  },
  "appearance": {
    "color": "#8b7355",
    "material": "wood|concrete|metal|glass|other",
    "texture": "smooth|rough|brick|tile|other"
  },
  "relationships": [
    {
      "groupId": "other-group-id",
      "type": "connects-to|adjacent-to|inside|on-top-of|other",
      "description": "Optional description"
    }
  ]
}
```

---

## Implementation Considerations

### Coordinate Conversion

The core challenge is converting between:
1. **Grid coordinates** (q, r) with optional edge offsets
2. **Screen coordinates** (x, y) for SVG rendering
3. **Isometric space coordinates** (for 3D-like calculations)

**Transformation Matrix**:
```
[ s/2   -s/2  ]   [q]   [screenX]
[ s√3/2  s√3/2] × [r] = [screenY]
```

**Inverse Transformation** (screen → grid):
```
q = (2*screenX + screenY/√3) / (2*s)
r = (2*screenY/√3 - screenX) / (2*s)
```

### Edge Point Calculation

For a point on an edge between grid positions `(q1, r1)` and `(q2, r2)` at fraction `t`:

```javascript
function edgePoint(q1, r1, q2, r2, t) {
  const q = (1 - t) * q1 + t * q2;
  const r = (1 - t) * r1 + t * r2;
  return gridToScreen(q, r);
}
```

### SVG Path Generation for Isometric Shapes

**Box**: Requires 3 visible faces:
- **Top face**: Parallelogram
- **Front face**: Parallelogram (vertical)
- **Right face**: Parallelogram (vertical)
- Each face is calculated using the 8 vertices of the box, with edge interpolation for fractional dimensions

**Ellipse**: Converted to screen-space ellipse using transformation matrix; may require `<path>` with arc commands for accuracy

**Cylinder**: Rendered with:
- Elliptical top and bottom faces (isometric projection of circles)
- Rectangular side faces connecting top and bottom

**Sphere**: Rendered as an isometric circle with optional gradient shading to suggest 3D form

**Cone**: Rendered with:
- Elliptical base face
- Triangular side faces converging to apex

**Pyramid**: Rendered with:
- Rectangular base face
- Triangular side faces converging to apex

All shapes support edge interpolation for fractional positioning and dimensions.

---

## Integration with Live Editing Sessions

### Browser-First Illustration Pipeline (Fits the MCP Tooling Contract)

This tool group is meant to **generate and iterate on SVG illustrations inside a live page** using our existing browser-editing workflow. It is **not** trying to replicate a general-purpose vector program (freehand path editing, bezier handles, arbitrary boolean ops, etc.).

The core idea is: **keep a small “scene model” + deterministic renderer**, and let the MCP tools drive iteration (create → preview → adjust → export/commit).

#### Pipeline Overview (What actually happens in the browser)

1. **Create a host container** in the page (or reuse an existing one).
   - Use `manipulate_dom` to insert a container `<div id="mcp-iso-root">…</div>`.
2. **Insert one SVG “canvas”** under that root.
   - Use `manipulate_dom` to insert `<svg id="mcp-iso-svg" ...>`.
3. **Inject a small renderer module** (pure JS) into the page.
   - Use `insert_js` (and `recordToSession: true`) to define:
     - projection (`gridToScreen`, optional inverse)
     - scene registry (objects keyed by id)
     - deterministic draw ordering (z-sort)
     - face shading (top/left/right)
     - incremental updates (diff DOM nodes instead of re-creating everything)
4. **Drive the scene by writing structured data**, not editing paths by hand.
   - Each “tool call” updates the scene model and re-renders to SVG.
5. **Export** the final SVG.
   - In live mode: serialize `#mcp-iso-svg.outerHTML` and write to disk via an export tool.
   - In MCP terms: record the JS that can export, and/or write an `.svg` file via `commit_edit_session_to_files` (targeting a `.svg` path).

#### Why a scene model is the right abstraction (vs “vector editing”)

Isometric illustrations mostly need:
- **grid-aligned placement** (including fractional edge offsets)
- **repeatable components** (windows, tiles, trees)
- **deterministic overlap handling** (painter’s algorithm / depth sorting)
- **consistent shading conventions** (3-tone faces)

Those are all easier if objects are stored as **parameters** (position/dimensions/style) and a renderer generates SVG paths.

#### Minimal “Scene Model” (enough for real illustrations)

Each object should be representable as something like:
- `id`, `shapeType`, `position`, `dimensions`
- `appearance`: base color, stroke, opacity, and a “material” style preset (optional)
- `metadata`: label, groupId, relationships, arbitrary JSON

Important: store positions in **grid coordinates** (q/r + optional edge offset). Only convert to screen coords at render time.

#### Deterministic Draw Order (critical for believable scenes)

SVG has no z-buffer; ordering is DOM order. So the renderer should enforce a stable sorting rule before drawing.

Practical approach for this toolset:
- **Primary sort key**: projected “depth” derived from grid coordinates (eg `q + r`, then `r`, then `q`).
- **Tie-breakers**: object type priority (ground tiles → structures → props), then `id`.
- **Within an object**: draw faces back-to-front (usually top first, then left/right depending on projection and light direction).

This matches common isometric painter’s-algorithm guidance: “draw back-to-front” using a sortable depth key.

**How this ties into LLM “identifying markers”:**

To help the AI (and humans) reason about ordering, each rendered element (or per-face element) should include explicit order hints as attributes so the LLM can *derive* and *verify* DOM order:
- `data-grid-q`, `data-grid-r` (canonical placement)
- `data-grid-edge-offset`, `data-grid-edge-dir` (if used)
- `data-iso-depth-key` (the computed sortable key, e.g. `"q+r,r,q"` or a single number)
- `data-z-index` (the final draw index in the sorted list)
- `data-face` (e.g. `"top" | "left" | "right"` when faces are separate paths)

This doesn’t replace sorting logic, but it makes ordering **inspectable** and allows an agent to repair order by re-sorting DOM nodes deterministically.

#### Shading Conventions (keep it simple and consistent)

Most isometric illustration styles rely on 3 faces:
- **Top**: lightest
- **Left**: mid
- **Right**: darkest

So `create_isometric_shape` should accept a single `fill` (base) and optionally:
- `shadeMode: "flat" | "3tone"`
- `lightDirection: "nw" | "ne"` (or similar)

Then the renderer derives face fills from `fill` (HSL adjust is usually fine).

**Gradient-based lighting (recommended for “illustration” feel without a vector program):**

Instead of flat HSL shifts, allow faces to use SVG gradients driven by a global light source:
- Establish one **scene light** (e.g. `light: {azimuthDeg, elevationDeg, strength}` or a simpler `lightDirection` vector in “iso space”).
- For each face, compute a gradient direction and stop colors based on the face normal vs light direction.
- Render face fills as `fill="url(#iso-grad-...)"`.

**Scene light schema (choose option A: azimuth/elevation):**

- `azimuthDeg`:
  - Angle *in the ground plane* measured in degrees.
  - **Reference**: `0°` points along the **NE axis** (the grid direction `(s/2, -h)` in screen space from the earlier definition).
  - `120°` points along **W**, `240°` points along **SE`.
  - Rotate **clockwise** for increasing degrees (so it matches screen space where +Y is down).
- `elevationDeg`:
  - `0°` = light at the horizon (purely lateral, in the ground plane)
  - `90°` = light straight “from above” (purely vertical)
- `intensity`:
  - Scalar strength (recommend `0..1`), used to scale how much gradients/shading deviate from the base color.

This schema is human/LLM-friendly (“light from NE at 45° elevation”), and the renderer can convert it into a unit vector internally.

Practical constraints so this stays lightweight:
- Prefer **reusing gradients**: define a small set of gradients per face type + palette rather than unique gradients for every object instance.
- Add stable IDs for gradients (e.g. derived from base color + face + light settings) so updates don’t bloat `<defs>`.
- Store linkable markers on faces:
  - `data-fill-base` (original color)
  - `data-fill-mode` (`flat` / `3tone` / `gradient`)
  - `data-light-id` (which scene light was used)

#### “Preview-first” iteration using edit sessions (fits README’s Level 0–2 spectrum)

Typical loop:
- `begin_edit_session`
- `manipulate_dom` (insert canvas once) with `recordToSession: true`
- `insert_js` (renderer) with `recordToSession: true`
- For each iteration:
  - update the scene model (via the injected JS API)
  - optionally capture evidence (`svg_snapshot`/`wireframe_snapshot`) to compare variants
- When ready:
  - `export_edit_session_package` (shareable log)
  - or `preview_commit_plan` → `apply_commit_plan` to roll the chosen SVG/JS changes into files

#### What the “tools” should actually do (in MCP terms)

If you implement this tool group as MCP server tools, each tool should be a thin wrapper around the browser renderer:
- `create_isometric_grid`: ensures the SVG exists + stores grid config in JS
- `create_isometric_shape`: adds an object to the scene model and re-renders
- `update_isometric_object`: patches object params and re-renders
- `group_isometric_objects`: creates/updates a group node (logical grouping + optional SVG `<g>`)
- `repeat_isometric_pattern`: expands into N objects (or uses `<symbol>/<use>` if you want compact DOM)
- `query_isometric_scene`: reads back the model + computed bounds for inspection
- `export_isometric_svg`: serializes to string and writes to a file path

This keeps the “illustration pipeline” aligned with the branch’s core idea in `README.md`: **iterate live in Chromium, then explicitly commit/export**.

### Workflow

1. **Initialize Grid**: `create_isometric_grid` to set up the SVG canvas
2. **Construct Objects**: Use `create_isometric_shape` with various `shapeType` values (box, ellipse, cylinder, sphere, etc.)
3. **Group Components**: `group_isometric_objects` for multi-part objects
4. **Repeat Patterns**: `repeat_isometric_pattern` for repetitive elements
5. **Query Scene**: `query_isometric_scene` for LLM to understand current state
6. **Update Objects**: `update_isometric_object` for modifications
7. **Export**: `export_isometric_svg` to save the final scene

### Edit Session Integration

The tools should integrate with the existing `edit_session` workflow:
- Use `recordToSession: true` when creating/updating objects
- Store SVG patches in edit sessions for later commit
- Support `targetFilePath` for committing to `.svg` files

---

## Research References

- [Isometric Projection - Wikipedia](https://en.wikipedia.org/wiki/Isometric_projection)
- [Barycentric Coordinates - Wikipedia](https://en.wikipedia.org/wiki/Barycentric_coordinate_system)
- [Triangle Grids - Red Blob Games](https://www.redblobgames.com/grids/parts/)
- [Isometric Diagrams with SVG - JointJS](https://www.jointjs.com/blog/isometric-diagrams)
- [SVG Patterns - MDN](https://developer.mozilla.org/en-US/docs/Web/SVG/Element/pattern)
- [Isometric Tiles Math - Clint Bellanger](https://clintbellanger.net/articles/isometric_math/)
- [Understanding Isometric Grids - Yal.cc](https://yal.cc/understanding-isometric-grids/)

---

## Summary

This tool group enables precise isometric SVG construction with:
- ✅ **Edge point access** for fractional grid positions
- ✅ **Generic shape creation** supporting multiple shape types (box, ellipse, cylinder, sphere, cone, pyramid, custom)
- ✅ **Repeat functions** with configurable intervals
- ✅ **Surface rendering** (shade/fill vs wireframe)
- ✅ **Rich metadata** for LLM scene evaluation
- ✅ **Component labeling** for multi-part objects
- ✅ **Orientation information** for spatial understanding
- ✅ **Grouping and relationships** for complex scenes

The tools are designed to work seamlessly with the existing wireframe-chrome-devtools MCP edit session workflow, enabling AI-driven isometric scene construction and modification.

