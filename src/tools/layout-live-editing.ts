/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import fs from 'node:fs';
import path from 'node:path';

import {ToolCategory} from './categories.js';
import {defineTool, type Context, type Response} from './ToolDefinition.js';
import {rollbackPatch} from './mutation.js';
import {svgSnapshotLiveEditing, wireframeSnapshotLiveEditing} from './wireframe.js';
import {recipeRegistry} from './recipes/index.js';
import {
  lengthSchema,
  normalizeLength,
  escapeHtml,
  convertItemsForAllRowsToRows,
} from './recipes/utils.js';

// Debug logging helper
const DEBUG_LOG_PATH = path.join(process.cwd(), '.cursor', 'debug.log');
function debugLog(data: {location: string; message: string; data: any; hypothesisId: string}) {
  try {
    const logEntry = JSON.stringify({
      ...data,
      timestamp: Date.now(),
      sessionId: 'debug-session',
      runId: 'run1',
    }) + '\n';
    fs.appendFileSync(DEBUG_LOG_PATH, logEntry, 'utf8');
  } catch (e) {
    // Ignore logging errors
  }
}

let compositionSchema: zod.ZodTypeAny;

const PATCH_ID_ATTR = 'data-mcp-patch-id';
const PATCH_OWNER_ATTR = 'data-mcp-patch-owner';
const PATCH_KIND_ATTR = 'data-mcp-patch-kind';
const PATCH_OWNER_VALUE = 'wireframe-chrome-devtools-mcp';

type ContentItem = zod.infer<typeof contentItemSchema>;
type GridRow = zod.infer<typeof gridRowSchema>;
type GridOverlayLayer = zod.infer<typeof gridOverlayLayerSchema>;
type LayoutGridParams = zod.infer<typeof layoutParametricGridSchema>;
type LayoutStackParams = zod.infer<typeof layoutParametricStackSchema>;
type ComponentViewerParams = zod.infer<typeof componentParametricViewerSchema>;
type BehaviorSpec = zod.infer<typeof behaviorSchema>;

type ComponentMapEntry = {
  elementName: string;
  id?: string;
  classes: string[];
  cssVariables: string[];
  selector?: string;
};

type ComponentMap = ComponentMapEntry[];

type RenderedComposition = {
  html: string;
  css: string;
  behaviors: BehaviorSpec[];
  componentMap?: ComponentMap;
};

// Schemas are imported from ./recipes/utils.js for basic types
// We extend them here to support composition (needs access to compositionSchemaWithStringSupport)
const offsetVectorSchema = zod.object({
  x: lengthSchema.optional().describe('Horizontal offset.'),
  y: lengthSchema.optional().describe('Vertical offset.'),
});

// Extended contentItemSchema with composition support (for use in layout-live-editing.ts)
const contentItemSchema: zod.ZodTypeAny = zod.union([
  zod.string().describe('Shorthand content label/string.'),
  zod.object({
    id: zod.string().optional().describe('Stable id for the item.'),
    label: zod.string().optional().describe('Human-readable label for the item.'),
    value: zod.string().optional().describe('Optional value for the item.'),
    content: zod
      .string()
      .optional()
      .describe('HTML string or text content to insert for the item.'),
    composition: compositionSchemaWithStringSupport()
      .optional()
      .describe('Nested composition to render inside this item.'),
    className: zod.string().optional().describe('Optional class name for the item.'),
    span: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe('Optional span/weight for proportional layouts.'),
    size: lengthSchema
      .optional()
      .describe('Fixed size for stack items along the main axis (e.g., "240px").'),
    minSize: lengthSchema
      .optional()
      .describe('Minimum size for stack items along the main axis.'),
    maxSize: lengthSchema
      .optional()
      .describe('Maximum size for stack items along the main axis.'),
    offset: zod
      .union([lengthSchema, offsetVectorSchema])
      .optional()
      .describe('Optional offset for positioning (scalar or {x,y}). Supports fractional units like "0.5fr" or "50%".'),
    style: zod
      .record(zod.string())
      .optional()
      .describe('Inline style overrides for the item.'),
  }),
]);

const gridRowSchema: zod.ZodTypeAny = zod.object({
  items: zod.array(contentItemSchema).min(1).describe('Items in the grid row.'),
  spans: zod
    .array(zod.number().int().positive())
    .optional()
    .describe('Optional per-item spans for the row.'),
  gap: lengthSchema.optional().describe('Row-specific gap override.'),
  offset: lengthSchema
    .optional()
    .describe('Optional offset (in units) applied before the row items.'),
});

const gridOverlayLayerSchema: zod.ZodTypeAny = zod.object({
  id: zod.string().optional().describe('Optional overlay layer id.'),
  items: zod.array(contentItemSchema).min(1).describe('Items in the overlay layer.'),
  spans: zod
    .array(zod.number().int().positive())
    .optional()
    .describe('Optional per-item spans for the overlay layer.'),
  offset: zod
    .union([lengthSchema, offsetVectorSchema])
    .optional()
    .describe('Optional overlay offset (scalar or {x,y}).'),
  zIndex: zod.number().int().optional().describe('Optional z-index for the layer.'),
});

// Base schema without refinements (for merging)
const layoutParametricGridSchemaBase = zod.object({
  rows: zod.array(gridRowSchema).min(1).optional().describe('Grid rows definition. Either rows or itemsForAllRows must be provided.'),
  itemsForAllRows: zod.array(contentItemSchema).min(1).optional().describe('Flat array of items for all rows (row-major order). Either columnCount or minItemWidth must be provided when using itemsForAllRows.'),
  columnCount: zod
    .number()
    .int()
    .positive()
    .optional()
    .describe('Explicit column count for all rows (prevents implicit wrapping). Required when using itemsForAllRows unless minItemWidth is provided.'),
  minItemWidth: zod
    .union([zod.string(), zod.number()])
    .optional()
    .describe('Minimum item width for responsive grids. When provided with itemsForAllRows, automatically calculates columnCount based on viewport width. Supports CSS length values (e.g., "240px", "20rem") or numbers (treated as pixels).'),
  unit: lengthSchema.optional().describe('Base unit size (e.g., "1fr").'),
  gap: lengthSchema.optional().describe('Shorthand: sets both columnGap and rowGap to the same value.'),
  columnGap: lengthSchema.optional().describe('Gap between columns (within each row).'),
  rowGap: lengthSchema.optional().describe('Gap between rows.'),
  rowHeight: lengthSchema.optional().describe('Fixed row height for all rows.'),
  rowMinHeight: lengthSchema.optional().describe('Minimum row height for all rows.'),
  rowLayout: zod
    .enum(['grid', 'flex'])
    .optional()
    .describe('Row layout mode ("grid" for CSS grid, "flex" for flex row).'),
  layers: zod
    .array(gridOverlayLayerSchema)
    .optional()
    .describe('Optional overlay layers (e.g., piano black keys).'),
});

// Schema with refinements (for validation)
const layoutParametricGridSchema: zod.ZodTypeAny = layoutParametricGridSchemaBase.refine(
  (data) => Boolean(data.rows) !== Boolean(data.itemsForAllRows),
  {
    message: 'Either rows or itemsForAllRows must be provided, but not both.',
  }
).refine(
  (data) => !data.itemsForAllRows || (data.columnCount !== undefined && data.columnCount > 0) || data.minItemWidth !== undefined,
  {
    message: 'Either columnCount or minItemWidth is required when using itemsForAllRows.',
  }
);

const layoutParametricStackSchema: zod.ZodTypeAny = zod.object({
  direction: zod
    .enum(['row', 'column'])
    .optional()
    .default('row')
    .describe('Stack direction.'),
  gap: lengthSchema.optional().describe('Gap between items.'),
  align: zod
    .enum(['start', 'center', 'end', 'stretch'])
    .optional()
    .describe('Alignment along the cross axis.'),
  justify: zod
    .enum(['start', 'center', 'end', 'between', 'around', 'evenly'])
    .optional()
    .describe('Distribution along the main axis.'),
  wrap: zod.boolean().optional().describe('Whether items can wrap.'),
  items: zod.array(contentItemSchema).min(1).describe('Items in the stack.'),
});

const behaviorSelectableSchema = zod.object({
  multiSelect: zod.boolean().optional().describe('Allow multiple selections.'),
  defaultSelectedIndex: zod
    .number()
    .int()
    .min(0)
    .optional()
    .describe('Index of the initially selected item.'),
  onActivate: zod
    .string()
    .optional()
    .describe('Action identifier to invoke when an item is activated.'),
});

const behaviorRovingFocusSchema = zod.object({
  axis: zod
    .enum(['x', 'y', 'both'])
    .optional()
    .describe('Arrow-key navigation axis.'),
  loop: zod
    .boolean()
    .optional()
    .describe('Wrap focus at the ends of the list.'),
});

const behaviorAriaPatternSchema = zod.object({
  pattern: zod
    .enum(['tabs', 'listbox', 'menu', 'grid', 'toolbar', 'radiogroup'])
    .describe('ARIA pattern to apply to the generated structure.'),
});

const behaviorDragResizeSchema = zod.object({
  axis: zod
    .enum(['x', 'y', 'both'])
    .optional()
    .describe('Resize axis for drag handles.'),
  minSize: lengthSchema.optional().describe('Minimum size for resizable panes.'),
  maxSize: lengthSchema.optional().describe('Maximum size for resizable panes.'),
  handleSize: lengthSchema.optional().describe('Size of drag handle.'),
});

const behaviorSchema = zod.discriminatedUnion('type', [
  zod.object({
    type: zod.literal('behavior_selectable'),
    params: behaviorSelectableSchema.optional(),
  }),
  zod.object({
    type: zod.literal('behavior_roving_focus'),
    params: behaviorRovingFocusSchema.optional(),
  }),
  zod.object({
    type: zod.literal('behavior_aria_pattern'),
    params: behaviorAriaPatternSchema.optional(),
  }),
  zod.object({
    type: zod.literal('behavior_drag_resize'),
    params: behaviorDragResizeSchema.optional(),
  }),
]);

/**
 * Converts flattened behavior parameters to the internal behaviors array format.
 * This allows users to use simpler flat parameters instead of nested discriminated unions.
 */
function convertFlattenedBehaviorsToArray(params: any): BehaviorSpec[] {
  const behaviors: BehaviorSpec[] = [];
  
  // Convert ariaPattern (string) to behavior_aria_pattern
  if (params.ariaPattern) {
    behaviors.push({
      type: 'behavior_aria_pattern',
      params: { pattern: params.ariaPattern },
    });
  }
  
  // Convert selectable (object) to behavior_selectable
  if (params.selectable) {
    behaviors.push({
      type: 'behavior_selectable',
      params: params.selectable,
    });
  }
  
  // Convert rovingFocus (object) to behavior_roving_focus
  if (params.rovingFocus) {
    behaviors.push({
      type: 'behavior_roving_focus',
      params: params.rovingFocus,
    });
  }
  
  // Convert dragResize (object) to behavior_drag_resize
  if (params.dragResize) {
    behaviors.push({
      type: 'behavior_drag_resize',
      params: params.dragResize,
    });
  }
  
  return behaviors;
}

// convertItemsForAllRowsToRows is imported from ./recipes/utils.js

const componentParametricViewerSchema: zod.ZodTypeAny = zod.object({
  variant: zod
    .enum(['tabs', 'carousel'])
    .optional()
    .describe('Viewer presentation variant.'),
  orientation: zod
    .enum(['horizontal', 'vertical'])
    .optional()
    .describe('Orientation of the trigger list.'),
  showControls: zod
    .boolean()
    .optional()
    .describe('Whether carousel prev/next controls are shown (carousel variant).'),
  showIndicators: zod
    .boolean()
    .optional()
    .describe('Whether carousel indicators are shown (carousel variant).'),
  ariaLabel: zod.string().optional().describe('Accessible label for the viewer.'),
  items: zod
    .array(
      zod.object({
        id: zod.string().optional(),
        label: zod.string().describe('Trigger label.'),
        content: zod
          .union([
            zod.string(),
            zod.object({
              composition: compositionSchemaWithStringSupport(),
            }),
          ])
          .describe('HTML content or nested composition for the panel/view.'),
      }),
    )
    .min(1)
    .describe('Selectable items rendered by the component.'),
});

compositionSchema = zod.discriminatedUnion('type', [
  layoutParametricGridSchemaBase.extend({
    type: zod.literal('layout_parametric_grid'),
    behaviors: zod.array(behaviorSchema).optional(),
  }),
  (layoutParametricStackSchema as zod.ZodObject<any>).extend({
    type: zod.literal('layout_parametric_stack'),
    behaviors: zod.array(behaviorSchema).optional(),
  }),
  (componentParametricViewerSchema as zod.ZodObject<any>).extend({
    type: zod.literal('component_parametric_viewer'),
    behaviors: zod.array(behaviorSchema).optional(),
  }),
]).superRefine((data, ctx) => {
  // Apply grid-specific refinements
  if (data.type === 'layout_parametric_grid') {
    if (Boolean(data.rows) === Boolean(data.itemsForAllRows)) {
      ctx.addIssue({
        code: zod.ZodIssueCode.custom,
        message: 'Either rows or itemsForAllRows must be provided, but not both.',
        path: [],
      });
    }
    if (data.itemsForAllRows && (data.columnCount === undefined || data.columnCount <= 0) && !data.minItemWidth) {
      ctx.addIssue({
        code: zod.ZodIssueCode.custom,
        message: 'Either columnCount or minItemWidth is required when using itemsForAllRows.',
        path: [],
      });
    }
  }
});

// Helper function to format Zod error paths for better readability
function formatZodErrorPath(path: (string | number)[]): string {
  if (path.length === 0) return 'composition';
  return `composition.${path.join('.')}`;
}

// Helper function to format Zod validation errors with clear field paths
function formatCompositionValidationError(error: zod.ZodError): string {
  const examples = getCompositionExamples();
  const issues = error.issues;
  
  if (issues.length === 0) {
    return `Invalid composition structure.\n\n${examples}`;
  }
  
  // Separate structural errors (custom) from validation errors
  const structuralErrors: zod.ZodIssue[] = [];
  const validationErrors: zod.ZodIssue[] = [];
  
  for (const issue of issues) {
    if (issue.code === zod.ZodIssueCode.custom && 
        (issue.message.includes('STRUCTURAL ERROR') || issue.message.includes('wrong level'))) {
      structuralErrors.push(issue);
    } else {
      validationErrors.push(issue);
    }
  }
  
  // Format structural errors first (they're usually more critical)
  const formattedStructural = structuralErrors.map(issue => {
    const fieldPath = formatZodErrorPath(issue.path);
    return `Field "${fieldPath}":\n${issue.message}`;
  });
  
  // Format validation errors
  const formattedValidation = validationErrors.map(issue => {
    const fieldPath = formatZodErrorPath(issue.path);
    let message = `Field "${fieldPath}": ${issue.message}`;
    
    // Provide specific guidance for common errors
    if (issue.path.length > 0) {
      const lastPath = issue.path[issue.path.length - 1];
      if (lastPath === 'rows' && issue.code === zod.ZodIssueCode.invalid_type) {
        message += '\n  Expected: array of row objects with "items" field';
      } else if (lastPath === 'layers' && issue.code === zod.ZodIssueCode.invalid_type) {
        message += '\n  Expected: array of overlay layer objects with "items" field';
      } else if (lastPath === 'items' && issue.code === zod.ZodIssueCode.invalid_type) {
        message += '\n  Expected: array of item objects or strings';
      }
      
      // Special handling for behaviors validation errors
      const pathStr = issue.path.join('.');
      if (pathStr.includes('behaviors')) {
        // Check if this is a discriminated union error
        if (issue.path.length >= 2 && issue.path[issue.path.length - 2] === 'behaviors') {
          const behaviorIndex = issue.path[issue.path.length - 2];
          const fieldName = issue.path[issue.path.length - 1];
          
          if (fieldName === 'type' || fieldName === 'params') {
            message += '\n\n  💡 TIP: The behaviors array uses a discriminated union structure which can be complex.';
            message += '\n  Consider using flattened parameters instead:';
            message += '\n  - ariaPattern: "tabs" (instead of behaviors with behavior_aria_pattern)';
            message += '\n  - selectable: { multiSelect: false } (instead of behaviors with behavior_selectable)';
            message += '\n  - rovingFocus: { axis: "x" } (instead of behaviors with behavior_roving_focus)';
            message += '\n  - dragResize: { axis: "x" } (instead of behaviors with behavior_drag_resize)';
            message += '\n\n  Example of correct behaviors array format:';
            message += '\n  {';
            message += '\n    "behaviors": [';
            message += '\n      { "type": "behavior_aria_pattern", "params": { "pattern": "tabs" } }';
            message += '\n    ]';
            message += '\n  }';
            message += '\n\n  Example using flattened format (recommended):';
            message += '\n  {';
            message += '\n    "ariaPattern": "tabs"';
            message += '\n  }';
          }
        }
      }
    }
    
    return message;
  });
  
  // Combine errors with structural errors first
  const allFormatted = [...formattedStructural, ...formattedValidation];
  
  let header = 'Composition validation failed:';
  if (structuralErrors.length > 0) {
    header = '❌ COMPOSITION VALIDATION FAILED (Structural Issues Detected):';
  }
  
  return `${header}\n\n${allFormatted.join('\n\n')}\n\n${examples}`;
}

// Helper function to generate example composition structures for error messages
function getCompositionExamples(): string {
  return `Example compositions:

⚠️ STRUCTURE: All layout parameters must be at the root level of the composition object:
composition
├── type ("layout_parametric_grid")
├── rows
│   └── [ { "items": [...] }, ... ]
├── layers
│   └── [ { "items": [...], "offset": ... }, ... ]
├── columnCount (number)
├── gap (length)
└── rowHeight (length)

1. layout_parametric_grid (basic):
{
  "type": "layout_parametric_grid",
  "rows": [
    { "items": ["Item 1", "Item 2", "Item 3"] }
  ],
  "columnCount": 3,
  "gap": "8px",
  "rowHeight": "100px"
}

2. layout_parametric_grid with overlay layers (e.g., piano keys):
{
  "type": "layout_parametric_grid",
  "rows": [
    { "items": ["C", "D", "E", "F", "G", "A", "B"] }
  ],
  "columnCount": 7,
  "gap": "2px",
  "rowHeight": "120px",
  "layers": [
    {
      "items": ["C#", "D#", "F#", "G#", "A#"],
      "offset": { "x": "0.5fr", "y": "0px" }
    }
  ]
}

3. layout_parametric_stack:
{
  "type": "layout_parametric_stack",
  "direction": "row",
  "gap": "16px",
  "items": ["Item 1", "Item 2", "Item 3"]
}

4. component_parametric_viewer:
{
  "type": "component_parametric_viewer",
  "variant": "tabs",
  "items": [
    { "label": "Tab 1", "content": "Content 1" },
    { "label": "Tab 2", "content": "Content 2" }
  ]
}

5. Using overlay_grid recipe (recommended for overlays):
{
  "recipe": "overlay_grid",
  "rows": [
    { "items": ["C", "D", "E", "F", "G", "A", "B"] }
  ],
  "layers": [
    {
      "items": ["C#", "D#", "F#", "G#", "A#"],
      "offset": { "x": "0.5fr", "y": "0px" }
    }
  ],
    "columnCount": 7
  }
}`;
}

// Helper function to detect if a value was double-stringified
function isDoubleStringified(val: unknown): boolean {
  if (typeof val !== 'string') return false;
  // Check if it looks like JSON but starts with quotes (indicating double stringification)
  const trimmed = val.trim();
  return (trimmed.startsWith('"{') || trimmed.startsWith('"[')) && trimmed.endsWith('"');
}

// Helper function to parse composition from string or object
function parseComposition(val: unknown): unknown {
  // #region agent log
  const debugDataC = {valType:typeof val,valIsString:typeof val === 'string',valIsObject:typeof val === 'object',valPreview:typeof val === 'string' ? (val as string).substring(0,100) : typeof val === 'object' ? JSON.stringify(val).substring(0,100) : String(val).substring(0,100)};
  debugLog({location:'layout-live-editing.ts:441',message:'Parse composition function entry',data:debugDataC,hypothesisId:'C'});
  // #endregion
  
  // If it's already an object, return it
  if (val && typeof val === 'object') {
    return val;
  }
  
  // If it's a string, parse it
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (isDoubleStringified(trimmed)) {
      try {
        const unwrapped = JSON.parse(trimmed);
        if (typeof unwrapped === 'string') {
          return parseComposition(unwrapped);
        }
      } catch (e) {
        // Fall through to normal parsing to surface a consistent error message.
      }
    }
    // #region agent log
    debugLog({location:'layout-live-editing.ts:450',message:'Parse: val is string, attempting JSON.parse',data:{valLength:val.length,valPreview:val.substring(0,200)},hypothesisId:'D'});
    // #endregion
    try {
      const parsed = JSON.parse(val);
      // #region agent log
      debugLog({location:'layout-live-editing.ts:454',message:'Parse: JSON.parse succeeded',data:{parsedType:typeof parsed,parsedIsObject:typeof parsed === 'object',parsedPreview:JSON.stringify(parsed).substring(0,100)},hypothesisId:'E'});
      // #endregion
      
      // After parsing, check if we got an object
      if (!parsed || typeof parsed !== 'object') {
        const examples = getCompositionExamples();
        throw new zod.ZodError([
          {
            code: zod.ZodIssueCode.custom,
            path: [],
            message: `Composition string parsed to "${typeof parsed}" instead of object. Expected a valid JSON object representing a composition.\n\nParsed value: ${JSON.stringify(parsed)}\n\n${examples}`,
          },
        ]);
      }
      
      return parsed;
    } catch (e) {
      // If parsing fails, throw a more helpful error
      const examples = getCompositionExamples();
      
      // Provide specific guidance based on the error
      let helpText = '';
      if (e instanceof SyntaxError) {
        helpText = '\n\n⚠️ The string is not valid JSON. Common issues:\n- Missing quotes around property names\n- Trailing commas\n- Single quotes instead of double quotes\n- Comments (not allowed in JSON)';
        if (trimmed.startsWith("{'") || /'[^']+'\s*:/.test(trimmed)) {
          helpText += '\n- Detected single quotes. Use double quotes or pass an object directly.';
        }
      } else if (e instanceof zod.ZodError) {
        // Re-throw Zod errors as-is
        throw e;
      }
      
      throw new zod.ZodError([
        {
          code: zod.ZodIssueCode.custom,
          path: [],
          message: `Failed to parse composition string as JSON: ${e instanceof Error ? e.message : String(e)}${helpText}\n\nReceived: ${val.length > 200 ? val.slice(0, 200) + '...' : val}\n\n⚠️ SOLUTION: Pass the composition as an object, not a JSON string.\n\n${examples}`,
        },
      ]);
    }
  }
  
  // If it's neither string nor object, throw error
  const examples = getCompositionExamples();
  throw new zod.ZodError([
    {
      code: zod.ZodIssueCode.custom,
      path: [],
      message: `Composition must be an object or JSON string, got ${typeof val}.\n\nReceived: ${String(val)}\n\n${examples}`,
    },
  ]);
}

// Helper function to wrap compositionSchema with string parsing support
// Uses zod.any() to bypass client-side validation issues with complex nested structures
// All validation happens server-side, allowing us to keep the full nested structure
function compositionSchemaWithStringSupport() {
  // Accept any value (string, object, etc.) - validation happens server-side
  // This bypasses JSON Schema conversion issues with discriminated unions and recursion
  return zod.any().describe(
    'Composition object or JSON string. Can be:\n' +
    '- Object: {type: "layout_parametric_grid", rows: [...], ...}\n' +
    '- String: JSON string that will be parsed\n' +
    '- Double-stringified JSON: will be unwrapped and parsed\n' +
    'Full validation happens server-side to support complex nested structures.'
  );
}

const recipeNameSchema = zod.enum([
  'selectable_view',
  'parametric_grid',
  'overlay_grid',
  'app_shell',
  'two_column',
  'three_panel',
  'toolbar',
  'grid_canvas',
]);

const compositionTypeValues = [
  'layout_parametric_grid',
  'layout_parametric_stack',
  'component_parametric_viewer',
] as const;

type CompositionType = (typeof compositionTypeValues)[number];

function isCompositionType(value: string): value is CompositionType {
  return compositionTypeValues.includes(value as CompositionType);
}

/**
 * Parses a selector that may contain array index notation (e.g., ".class[6]")
 * and returns a function that can find the target element.
 * 
 * Array index notation is converted to: find all matching elements, then select by index.
 * Regular CSS selectors are used as-is.
 */
function parseSelectorWithIndex(selector: string): {
  baseSelector: string;
  index?: number;
} {
  // Match pattern like ".class[6]" or "#id[0]"
  const indexMatch = selector.match(/^(.+)\[(\d+)\]$/);
  if (indexMatch) {
    return {
      baseSelector: indexMatch[1],
      index: Number.parseInt(indexMatch[2], 10),
    };
  }
  return {baseSelector: selector};
}

const targetSchema = zod.object({
  selector: zod.string().describe('CSS selector to insert into (default: body). Supports array index notation like ".class[6]" to select the 6th matching element (0-based).'),
  position: zod
    .enum(['beforebegin', 'afterbegin', 'beforeend', 'afterend'])
    .optional()
    .describe('Insert position relative to the target element.'),
});

const rootSchema = zod.object({
  id: zod.string().optional().describe('Root element id to create or reuse.'),
  classPrefix: zod
    .string()
    .optional()
    .describe('CSS class prefix for scoped styles (e.g., "mcp-le").'),
  scopeSelector: zod
    .string()
    .optional()
    .describe('Optional selector used for CSS scoping (defaults to root).'),
});

const patchSchema = zod.object({
  patchIdPrefix: zod
    .string()
    .optional()
    .describe('Prefix used to generate stable patch ids for DOM/CSS/JS.'),
  replaceExisting: zod
    .boolean()
    .optional()
    .describe('If true, replaces existing patches with matching patch ids.'),
  cssMode: zod
    .enum(['replace', 'merge', 'append'])
    .optional()
    .describe('CSS update mode: "replace" (default, replaces entire CSS), "merge" (merges with existing, updates conflicting rules), "append" (appends new CSS without removing existing).'),
  recordToSession: zod
    .boolean()
    .optional()
    .describe('If true, record generated patches in the edit session journal.'),
  editSessionId: zod
    .string()
    .optional()
    .describe('Optional edit session id to record into.'),
  targetFilePaths: zod
    .object({
      html: zod.string().optional(),
      css: zod.string().optional(),
      js: zod.string().optional(),
    })
    .optional()
    .describe('Optional file targets used by commit/export tooling.'),
});

const themeSchema = zod.object({
  density: zod.enum(['compact', 'comfortable', 'spacious']).optional(),
  surfaceIntent: zod
    .enum(['industrial', 'system', 'utility', 'glass'])
    .optional()
    .describe('High-level visual intent that sets default colors and depth.'),
  interactionModel: zod
    .enum(['precision', 'touch', 'kiosk'])
    .optional()
    .describe('Control sizing and spacing for different interaction targets.'),
  visualWeight: zod
    .enum(['flat', 'skeuomorphic', 'elevated'])
    .optional()
    .describe('Border/shadow style for UI depth.'),
  separatorStyle: zod
    .enum(['subtle', 'strong', 'none'])
    .optional()
    .describe('Separator intensity for dividers and panel outlines.'),
  palette: zod
    .object({
      background: zod.string().optional(),
      surface: zod.string().optional(),
      accent: zod.string().optional(),
      text: zod.string().optional(),
      border: zod.string().optional(),
      muted: zod.string().optional(),
      shadow: zod.string().optional(),
    })
    .optional()
    .describe('Color palette overrides for generated UI.'),
  auto: zod
    .union([
      zod.boolean(),
      zod.object({
        sampleSelector: zod
          .string()
          .optional()
          .describe('Optional selector used for theme sampling.'),
      }),
    ])
    .optional()
    .describe('Auto-detect palette from target page styles.'),
  radius: zod.number().optional().describe('Corner radius token (px).'),
  spacing: zod
    .union([zod.string(), zod.number()])
    .optional()
    .describe('Spacing token or base spacing value.'),
  tokens: zod
    .object({
      spacing: zod.array(zod.number()).optional(),
      radius: zod.array(zod.number()).optional(),
      fontFamily: zod.string().optional(),
    })
    .optional(),
});

const verifySchema = zod.object({
  wireframeSnapshot: zod
    .boolean()
    .optional()
    .describe('If true, capture a wireframe snapshot after applying.'),
  svgSnapshot: zod
    .boolean()
    .default(true)
    .optional()
    .describe('If true, capture an SVG wireframe snapshot after applying. Defaults to true for visual confirmation of layout changes.'),
});

// escapeHtml is imported from ./recipes/utils.js

function extractCssVariables(cssText: string, selector: string, prefix: string): string[] {
  const variables = new Set<string>();
  const selectorPattern = new RegExp(
    `(${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^{]*)\\{([^}]+)\\}`,
    'g',
  );
  const varPattern = new RegExp(`var\\(--${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-([^,)]+)\\)`, 'g');
  
  let match;
  while ((match = selectorPattern.exec(cssText)) !== null) {
    const ruleBody = match[2];
    let varMatch;
    while ((varMatch = varPattern.exec(ruleBody)) !== null) {
      variables.add(varMatch[1]);
    }
  }
  return Array.from(variables).sort();
}

// normalizeLength is imported from ./recipes/utils.js

function parseUnitOffset(offset: number | string | undefined): number | null {
  if (offset === undefined) {return null;}
  if (typeof offset === 'number') {return offset;}
  const trimmed = offset.trim();
  // Support "u" suffix (e.g., "0.5u")
  if (trimmed.endsWith('u')) {
    const parsed = Number(trimmed.slice(0, -1));
    return Number.isFinite(parsed) ? parsed : null;
  }
  // Support fractional fr units (e.g., "0.5fr" -> 0.5)
  if (trimmed.endsWith('fr')) {
    const parsed = Number(trimmed.slice(0, -2));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function resolveOverlayOffset(offset: GridOverlayLayer['offset']): {
  unitOffset: number | null;
  translateX?: string;
  translateY?: string;
} {
  if (!offset) {
    return {unitOffset: null};
  }
  if (typeof offset === 'number' || typeof offset === 'string') {
    const unitOffset = parseUnitOffset(offset);
    if (unitOffset !== null) {
      return {unitOffset};
    }
    const translateX = normalizeLength(offset);
    return {unitOffset: null, translateX};
  }
  const xOffset = offset.x;
  const yOffset = offset.y;
  const unitOffset = parseUnitOffset(xOffset);
  const translateX = unitOffset === null ? normalizeLength(xOffset) : undefined;
  const translateY = normalizeLength(yOffset);
  return {unitOffset, translateX, translateY};
}

type RgbaColor = {r: number; g: number; b: number; a: number};

function parseColor(value: string | undefined): RgbaColor | null {
  if (!value) {return null;}
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {return null;}
  if (trimmed === 'transparent') {return {r: 0, g: 0, b: 0, a: 0};}
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      return {r, g, b, a: 1};
    }
    if (hex.length === 4) {
      const r = parseInt(hex[0] + hex[0], 16);
      const g = parseInt(hex[1] + hex[1], 16);
      const b = parseInt(hex[2] + hex[2], 16);
      const a = parseInt(hex[3] + hex[3], 16) / 255;
      return {r, g, b, a};
    }
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return {r, g, b, a};
    }
  }
  if (trimmed.startsWith('rgb')) {
    const match = trimmed.match(/rgba?\(([^)]+)\)/);
    if (!match) {return null;}
    const parts = match[1].split(',').map(part => part.trim());
    const r = Number(parts[0]);
    const g = Number(parts[1]);
    const b = Number(parts[2]);
    const a = parts.length > 3 ? Number(parts[3]) : 1;
    if ([r, g, b, a].some(part => Number.isNaN(part))) {return null;}
    return {r, g, b, a};
  }
  return null;
}

function relativeLuminance(color: RgbaColor): number {
  const srgb = [color.r, color.g, color.b].map(component => {
    const value = component / 255;
    return value <= 0.03928 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * srgb[0] + 0.7152 * srgb[1] + 0.0722 * srgb[2];
}

function chooseContrastColor(value: string | undefined, fallback: string): string {
  const parsed = parseColor(value);
  if (!parsed || parsed.a === 0) {return fallback;}
  return relativeLuminance(parsed) > 0.5 ? '#000000' : '#ffffff';
}

function colorWithAlpha(value: string | undefined, alpha: number): string | null {
  const parsed = parseColor(value);
  if (!parsed) {return null;}
  return `rgba(${parsed.r}, ${parsed.g}, ${parsed.b}, ${Math.max(0, Math.min(alpha, 1))})`;
}

/**
 * CSS Helper Functions for merge/append operations
 */

type CssRule = {
  selector: string;
  properties: string;
  fullText: string;
};

/**
 * Parse CSS text into individual rules
 */
function parseCssRules(cssText: string): CssRule[] {
  const rules: CssRule[] = [];
  // Remove comments
  const cleaned = cssText.replace(/\/\*[\s\S]*?\*\//g, '');
  // Match selector { properties }
  const rulePattern = /([^{]+)\{([^}]+)\}/g;
  let match;
  while ((match = rulePattern.exec(cleaned)) !== null) {
    const selector = match[1].trim();
    const properties = match[2].trim();
    if (selector && properties) {
      rules.push({
        selector,
        properties,
        fullText: match[0],
      });
    }
  }
  return rules;
}

/**
 * Extract unique selectors from CSS text
 */
function extractCssSelectors(cssText: string): Set<string> {
  const selectors = new Set<string>();
  const rules = parseCssRules(cssText);
  rules.forEach(rule => {
    // Split multiple selectors (comma-separated)
    rule.selector.split(',').forEach(sel => {
      const trimmed = sel.trim();
      if (trimmed) {
        selectors.add(trimmed);
      }
    });
  });
  return selectors;
}

/**
 * Merge two CSS texts, updating conflicting rules from newCss
 */
function mergeCss(existingCss: string, newCss: string): string {
  const existingRules = parseCssRules(existingCss);
  const newRules = parseCssRules(newCss);
  
  // Create a map of existing rules by selector
  const existingMap = new Map<string, CssRule[]>();
  existingRules.forEach(rule => {
    const key = rule.selector.trim();
    if (!existingMap.has(key)) {
      existingMap.set(key, []);
    }
    existingMap.get(key)!.push(rule);
  });
  
  // Create a map of new rules by selector
  const newMap = new Map<string, CssRule[]>();
  newRules.forEach(rule => {
    const key = rule.selector.trim();
    if (!newMap.has(key)) {
      newMap.set(key, []);
    }
    newMap.get(key)!.push(rule);
  });
  
  // Build merged CSS: keep non-conflicting existing rules, add/update with new rules
  const mergedRules: CssRule[] = [];
  
  // Add all existing rules that don't conflict
  existingRules.forEach(rule => {
    const key = rule.selector.trim();
    if (!newMap.has(key)) {
      mergedRules.push(rule);
    }
  });
  
  // Add all new rules (these override existing ones with same selector)
  mergedRules.push(...newRules);
  
  // Combine into CSS text
  return mergedRules.map(rule => rule.fullText).join('\n\n');
}

/**
 * Append CSS, keeping all existing rules
 */
function appendCss(existingCss: string, newCss: string): string {
  const existing = existingCss.trim();
  const appended = newCss.trim();
  if (!existing) return appended;
  if (!appended) return existing;
  return `${existing}\n\n${appended}`;
}

/**
 * Validate CSS replacement and generate warnings
 */
function validateCssReplacement(
  existingCss: string | null,
  newCss: string,
  mode: 'replace' | 'merge' | 'append',
): {warnings: string[]; shouldWarn: boolean} {
  const warnings: string[] = [];
  
  if (!existingCss || mode !== 'replace') {
    return {warnings: [], shouldWarn: false};
  }
  
  const existingSize = existingCss.length;
  const newSize = newCss.length;
  const sizeDiff = existingSize - newSize;
  const sizeReductionPercent = existingSize > 0 ? (sizeDiff / existingSize) * 100 : 0;
  
  // Warn if replacing large CSS with significantly smaller CSS
  if (sizeReductionPercent > 50 && existingSize > 1000) {
    warnings.push(
      `Replacing ${existingSize} char CSS with ${newSize} char CSS (${Math.round(sizeReductionPercent)}% reduction). ` +
      `This will remove ${Math.round(sizeReductionPercent)}% of existing styles.`
    );
  }
  
  // Check for missing selectors
  const existingSelectors = extractCssSelectors(existingCss);
  const newSelectors = extractCssSelectors(newCss);
  const missingSelectors: string[] = [];
  
  existingSelectors.forEach(selector => {
    if (!newSelectors.has(selector)) {
      missingSelectors.push(selector);
    }
  });
  
  if (missingSelectors.length > 0 && missingSelectors.length <= 10) {
    warnings.push(
      `Original CSS contained ${missingSelectors.length} selector(s) that are missing in replacement: ` +
      `${missingSelectors.slice(0, 5).join(', ')}${missingSelectors.length > 5 ? '...' : ''}`
    );
  } else if (missingSelectors.length > 10) {
    warnings.push(
      `Original CSS contained ${missingSelectors.length} selectors that are missing in replacement. ` +
      `This will remove styles for many elements.`
    );
  }
  
  return {
    warnings,
    shouldWarn: warnings.length > 0,
  };
}

function unwrapSchema(schema: zod.ZodTypeAny): {schema: zod.ZodTypeAny; optional: boolean} {
  let current: zod.ZodTypeAny = schema;
  let optional = false;
  while (current instanceof zod.ZodOptional || current instanceof zod.ZodDefault) {
    optional = true;
    current = current._def.innerType;
  }
  return {schema: current, optional};
}

function typeLabel(schema: zod.ZodTypeAny): string {
  if (schema instanceof zod.ZodString) {return 'string';}
  if (schema instanceof zod.ZodNumber) {return 'number';}
  if (schema instanceof zod.ZodBoolean) {return 'boolean';}
  if (schema instanceof zod.ZodEnum) {
    return `enum(${schema._def.values.join(' | ')})`;
  }
  if (schema instanceof zod.ZodArray) {
    return `array<${typeLabel(schema._def.type)}>`;
  }
  if (schema instanceof zod.ZodObject) {
    return 'object';
  }
  if (schema instanceof zod.ZodRecord) {
    return 'record';
  }
  return schema._def?.typeName ?? 'unknown';
}

function summarizeRecipeSchema(schema: zod.ZodTypeAny): Record<string, {type: string; optional: boolean; description?: string}> {
  if (!(schema instanceof zod.ZodObject)) {
    return {params: {type: typeLabel(schema), optional: false}};
  }
  const shape = schema.shape;
  return Object.fromEntries(
    Object.entries(shape).map(([key, value]) => {
      const typed = value as zod.ZodTypeAny;
      const {schema: inner, optional} = unwrapSchema(typed);
      return [
        key,
        {
          type: typeLabel(inner),
          optional,
          description: typed.description,
        },
      ];
    }),
  );
}

// Convert camelCase CSS property names to kebab-case
function camelToKebab(str: string): string {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function buildInlineStyle(style?: Record<string, string>): string {
  if (!style) {return '';}
  const entries = Object.entries(style)
    .map(([key, value]) => `${camelToKebab(key)}:${value}`)
    .join(';');
  return entries ? ` style="${escapeHtml(entries)}"` : '';
}

function coerceItem(item: ContentItem) {
  if (typeof item === 'string') {
    return {label: item, content: escapeHtml(item)};
  }
  const label = item.label ?? item.value ?? '';
  const content = item.content ?? (label ? escapeHtml(label) : '');
  return {
    ...item,
    label,
    content,
  };
}

function renderContentItem(item: ContentItem, prefix: string, componentMap?: ComponentMap): {
  html: string;
  css: string;
  behaviors: BehaviorSpec[];
  resolved: ReturnType<typeof coerceItem>;
} {
  const resolved = coerceItem(item);
  if (typeof item === 'object' && item && 'composition' in item && item.composition) {
    const nested = renderComposition(item.composition as any, prefix, componentMap);
    return {
      html: `<div class="${prefix}-nested">${nested.html}</div>`,
      css: nested.css,
      behaviors: nested.behaviors,
      resolved,
    };
  }
  return {
    html: resolved.content ?? '',
    css: '',
    behaviors: [],
    resolved,
  };
}

function buildGridRowHtml(
  row: GridRow,
  prefix: string,
  rowIndex: number,
  unit: string,
  defaultGap?: string,
  options?: {
    rowHeight?: string;
    rowMinHeight?: string;
    rowLayout?: 'grid' | 'flex';
    columnCount?: number;
    componentMap?: ComponentMap;
  },
): {
  html: string;
  rowCss: string[];
  nestedCss: string[];
  nestedBehaviors: BehaviorSpec[];
  totalUnits: number;
} {
  const spans = normalizeSpans(row.spans, row.items.length, `row ${rowIndex}`);
  const offsetUnits = parseUnitOffset(row.offset);
  const columnGap = normalizeLength(row.gap ?? defaultGap);
  const totalUnits =
    spans.reduce((acc: number, span: number) => acc + (Number.isFinite(span) ? span : 1), 0) +
    (offsetUnits ? Math.ceil(offsetUnits) : 0);

  const rowStyles: string[] = [];
  const nestedCss: string[] = [];
  const nestedBehaviors: BehaviorSpec[] = [];
  if (columnGap) {rowStyles.push(`gap: ${columnGap};`);}
  if (options?.rowHeight) {rowStyles.push(`height: ${options.rowHeight};`);}
  if (options?.rowMinHeight) {rowStyles.push(`min-height: ${options.rowMinHeight};`);}
  if (row.offset && offsetUnits === null) {
    const pad = normalizeLength(row.offset);
    if (pad) {rowStyles.push(`padding-left: ${pad};`);}
  }
  if (offsetUnits !== null && offsetUnits < 0) {
    throw new Error(`Row ${rowIndex} offset must be >= 0 when expressed in units.`);
  }

  const rowStyleAttr = rowStyles.length ? ` style="${rowStyles.join(' ')}"` : '';

  let html = `<div class="${prefix}-grid-row" data-le-row="${rowIndex}"${rowStyleAttr}>`;
  if (offsetUnits && offsetUnits > 0) {
    const spanValue = Math.max(1, Math.ceil(offsetUnits));
    const spacerStyle =
      options?.rowLayout === 'flex'
        ? `flex:${spanValue} 1 0;`
        : `grid-column: span ${spanValue};`;
    html += `<div class="${prefix}-grid-spacer" style="${spacerStyle}"></div>`;
  }

  row.items.forEach((item: ContentItem, itemIndex: number) => {
    const rendered = renderContentItem(item, prefix, (options as any)?.componentMap);
    const resolved = rendered.resolved;
    const span = spans[itemIndex] ?? 1;
    const style = resolved.style ?? {};
    const spanStyle =
      options?.rowLayout === 'flex'
        ? `flex:${span} 1 0;`
        : span > 1
          ? `grid-column: span ${span};`
          : '';
    const inlineStyle = spanStyle
      ? ` style="${spanStyle}${Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';')}"`
      : buildInlineStyle(style);
    const className = resolved.className ? ` ${resolved.className}` : '';
    html += `<div class="${prefix}-grid-item${className}" data-le-item data-le-index="${itemIndex}"${inlineStyle}>${rendered.html}</div>`;
    if (rendered.css) {nestedCss.push(rendered.css);}
    if (rendered.behaviors.length) {nestedBehaviors.push(...rendered.behaviors);}
  });
  html += '</div>';

  const layout = options?.rowLayout ?? 'grid';
  const templateUnits = Math.max(options?.columnCount ?? totalUnits, 1);
  const rowCss = [
    layout === 'grid'
      ? `grid-template-columns: repeat(${templateUnits}, minmax(0, ${unit}));`
      : 'flex-direction: row;',
    layout === 'grid' ? 'display: grid;' : 'display: flex;',
  ];

  return {html, rowCss, nestedCss, nestedBehaviors, totalUnits};
}

function buildGridOverlayHtml(
  layer: GridOverlayLayer,
  prefix: string,
  layerIndex: number,
  unit: string,
  baseUnits: number,
  columnCount?: number,
  componentMap?: ComponentMap,
): {
  html: string;
  overlayCss: string[];
  nestedCss: string[];
  nestedBehaviors: BehaviorSpec[];
} {
  const spans = normalizeSpans(layer.spans, layer.items.length, `overlay layer ${layerIndex}`);
  const offset = resolveOverlayOffset(layer.offset);
  const offsetUnits = offset.unitOffset;
  const totalUnits =
    spans.reduce((acc: number, span: number) => acc + (Number.isFinite(span) ? span : 1), 0) +
    (offsetUnits ? Math.ceil(offsetUnits) : 0);
  const templateUnits = Math.max(columnCount ?? totalUnits, baseUnits);
  const zIndex = layer.zIndex ?? 2;
  const nestedCss: string[] = [];
  const nestedBehaviors: BehaviorSpec[] = [];

  if (offsetUnits !== null && offsetUnits < 0) {
    throw new Error(`Overlay layer ${layerIndex} offset must be >= 0 when expressed in units.`);
  }

  const transformParts = [
    // Handle unit-based offsets (including fractional fr units) for layer-level offset
    // For fractional offsets, use transform. For whole-number offsets, use spacer + transform if needed
    offsetUnits !== null && offsetUnits !== 0 && !offset.translateX
      ? `translateX(calc(${offsetUnits} * ${unit}))`
      : '',
    // Handle explicit translateX/translateY values
    offset.translateX ? `translateX(${offset.translateX})` : '',
    offset.translateY ? `translateY(${offset.translateY})` : '',
  ].filter(Boolean);
  const overlayStyles = [`z-index:${zIndex};`];
  if (transformParts.length) {
    overlayStyles.push(`transform:${transformParts.join(' ')};`);
  }
  let html = `<div class="${prefix}-grid-overlay" data-le-overlay="${layerIndex}" style="${overlayStyles.join('')}">`;
  // Only create spacer for whole-number offsets (for grid column positioning)
  // Fractional offsets use transform instead
  if (offsetUnits && offsetUnits > 0 && Number.isInteger(offsetUnits)) {
    const spanValue = Math.max(1, Math.ceil(offsetUnits));
    html += `<div class="${prefix}-grid-spacer" style="grid-column: span ${spanValue};"></div>`;
  }

  layer.items.forEach((item: ContentItem, itemIndex: number) => {
    const rendered = renderContentItem(item, prefix, componentMap);
    const resolved = rendered.resolved;
    const span = spans[itemIndex] ?? 1;
    const style = resolved.style ?? {};
    
    // Handle per-item offset
    let itemTransformParts: string[] = [];
    if (typeof item === 'object' && item && 'offset' in item && item.offset) {
      const itemOffset = resolveOverlayOffset(item.offset);
      
      // Handle unit-based offsets (including fractional fr units)
      if (itemOffset.unitOffset !== null && itemOffset.unitOffset !== 0) {
        // For unit offsets, use calc() with the unit size
        // e.g., 0.5fr becomes calc(0.5 * 1fr)
        const offsetValue = itemOffset.unitOffset;
        // Use calc to multiply the unit by the offset value
        itemTransformParts.push(`translateX(calc(${offsetValue} * ${unit}))`);
      }
      
      // Handle explicit translateX/translateY values (these can coexist with unit offsets for y-axis)
      if (itemOffset.translateX) {
        itemTransformParts.push(`translateX(${itemOffset.translateX})`);
      }
      if (itemOffset.translateY) {
        itemTransformParts.push(`translateY(${itemOffset.translateY})`);
      }
    }
    
    const spanStyle = span > 1 ? `grid-column: span ${span};` : '';
    const transformStyle = itemTransformParts.length > 0 ? `transform:${itemTransformParts.join(' ')};` : '';
    const combinedStyle = [spanStyle, transformStyle, ...Object.entries(style).map(([k, v]) => `${k}:${v}`)].filter(Boolean).join(';');
    const inlineStyle = combinedStyle ? ` style="${combinedStyle}"` : buildInlineStyle(style);
    const className = resolved.className ? ` ${resolved.className}` : '';
    html += `<div class="${prefix}-grid-overlay-item${className}" data-le-item data-le-index="${itemIndex}"${inlineStyle}>${rendered.html}</div>`;
    if (rendered.css) {nestedCss.push(rendered.css);}
    if (rendered.behaviors.length) {nestedBehaviors.push(...rendered.behaviors);}
  });
  html += '</div>';

  const overlayCss = [
    `grid-template-columns: repeat(${Math.max(templateUnits, 1)}, minmax(0, ${unit}));`,
  ];

  return {html, overlayCss, nestedCss, nestedBehaviors};
}

function buildGridLayout(params: LayoutGridParams, prefix: string, componentMap?: ComponentMap): RenderedComposition {
  const unit = normalizeLength(params.unit) ?? '1fr';
  const columnGap = normalizeLength((params as any).columnGap ?? params.gap);
  const rowGap = normalizeLength(params.rowGap ?? params.gap) ?? '0.75rem';
  const rowHeight = normalizeLength(params.rowHeight);
  const rowMinHeight = normalizeLength(params.rowMinHeight) ?? '56px';
  const rowLayout = params.rowLayout ?? 'grid';
  const rowHtml: string[] = [];
  const rowStyles: string[] = [];
  const nestedCss: string[] = [];
  const nestedBehaviors: BehaviorSpec[] = [];
  let maxRowUnits = 1;
  params.rows.forEach((row: GridRow, index: number) => {
    const {html, rowCss, nestedCss: nestedRowCss, nestedBehaviors: nestedRowBehaviors, totalUnits} =
      buildGridRowHtml(row, prefix, index, unit, columnGap, {
        rowHeight,
        rowMinHeight,
        rowLayout,
        columnCount: params.columnCount,
        componentMap,
      } as any);
    rowHtml.push(html);
    rowStyles.push(`.${prefix}-grid-row[data-le-row="${index}"]{${rowCss.join('')}}`);
    nestedCss.push(...nestedRowCss);
    nestedBehaviors.push(...nestedRowBehaviors);
    maxRowUnits = Math.max(maxRowUnits, totalUnits);
  });

  const layoutColumnCount = params.columnCount ?? maxRowUnits;
  const overlayHtml: string[] = [];
  const overlayStyles: string[] = [];
  if (params.layers && params.layers.length > 0) {
    params.layers.forEach((layer: GridOverlayLayer, index: number) => {
      const {
        html,
        overlayCss,
        nestedCss: nestedLayerCss,
        nestedBehaviors: nestedLayerBehaviors,
      } = buildGridOverlayHtml(layer, prefix, index, unit, maxRowUnits, layoutColumnCount, componentMap);
      overlayHtml.push(html);
      overlayStyles.push(
        `.${prefix}-grid-overlay[data-le-overlay="${index}"]{${overlayCss.join('')}}`,
      );
      nestedCss.push(...nestedLayerCss);
      nestedBehaviors.push(...nestedLayerBehaviors);
    });
  }

  const html = `
    <div class="${prefix}-grid" data-le-layout="grid">
      <div class="${prefix}-grid-base">
        ${rowHtml.join('\n')}
      </div>
      ${overlayHtml.join('\n')}
    </div>
  `;

  // Base grid row CSS: ensure display: grid is set when rowLayout is grid
  const baseGridRowCss = rowLayout === 'grid' 
    ? `display:grid;align-items:stretch;`
    : `display:flex;align-items:stretch;`;
  
  // Add default grid-template-columns when columnCount is provided
  // This ensures grid works even if per-row rules don't apply (prevents overlapping items)
  const defaultGridTemplateColumns = rowLayout === 'grid' && layoutColumnCount && layoutColumnCount > 0
    ? `grid-template-columns: repeat(${layoutColumnCount}, minmax(0, ${unit}));`
    : '';
  
  const css = `
    .${prefix}-grid{position:relative;display:block;}
    .${prefix}-grid-base{display:flex;flex-direction:column;gap:${rowGap};}
    .${prefix}-grid-row{${baseGridRowCss}${defaultGridTemplateColumns}}
    .${prefix}-grid-item,.${prefix}-grid-overlay-item{display:flex;align-items:center;justify-content:center;}
    .${prefix}-grid-overlay{position:absolute;inset:0;display:grid;pointer-events:none;align-items:stretch;}
    .${prefix}-grid-overlay-item{pointer-events:auto;align-self:stretch;min-height:100%;}
    ${rowStyles.join('\n')}
    ${overlayStyles.join('\n')}
  `;

  const fullCss = `${css}\n${nestedCss.join('\n')}`;
  
  if (componentMap) {
    componentMap.push({
      elementName: 'grid',
      classes: [`${prefix}-grid`],
      cssVariables: extractCssVariables(fullCss, `\\.${prefix}-grid`, prefix),
      selector: `.${prefix}-grid`,
    });
    componentMap.push({
      elementName: 'grid-base',
      classes: [`${prefix}-grid-base`],
      cssVariables: extractCssVariables(fullCss, `\\.${prefix}-grid-base`, prefix),
      selector: `.${prefix}-grid-base`,
    });
    componentMap.push({
      elementName: 'grid-row',
      classes: [`${prefix}-grid-row`],
      cssVariables: extractCssVariables(fullCss, `\\.${prefix}-grid-row`, prefix),
      selector: `.${prefix}-grid-row`,
    });
    componentMap.push({
      elementName: 'grid-item',
      classes: [`${prefix}-grid-item`],
      cssVariables: extractCssVariables(fullCss, `\\.${prefix}-grid-item`, prefix),
      selector: `.${prefix}-grid-item`,
    });
    if (params.layers && params.layers.length > 0) {
      componentMap.push({
        elementName: 'grid-overlay',
        classes: [`${prefix}-grid-overlay`],
        cssVariables: extractCssVariables(fullCss, `\\.${prefix}-grid-overlay`, prefix),
        selector: `.${prefix}-grid-overlay`,
      });
      componentMap.push({
        elementName: 'grid-overlay-item',
        classes: [`${prefix}-grid-overlay-item`],
        cssVariables: extractCssVariables(fullCss, `\\.${prefix}-grid-overlay-item`, prefix),
        selector: `.${prefix}-grid-overlay-item`,
      });
    }
  }

  return {html, css: fullCss, behaviors: nestedBehaviors, componentMap};
}

function buildStackLayout(
  params: LayoutStackParams,
  prefix: string,
  options?: {enableResize?: boolean; componentMap?: ComponentMap},
): RenderedComposition {
  const direction = params.direction ?? 'row';
  const gap = normalizeLength(params.gap) ?? '0.5rem';
  const align = params.align ?? 'stretch';
  const justifyMap: Record<string, string> = {
    start: 'flex-start',
    center: 'center',
    end: 'flex-end',
    between: 'space-between',
    around: 'space-around',
    evenly: 'space-evenly',
  };
  const justify = params.justify ? justifyMap[params.justify] : 'flex-start';
  const nestedCss: string[] = [];
  const nestedBehaviors: BehaviorSpec[] = [];
  const componentMap = options?.componentMap;

  const resizeAttr = options?.enableResize ? ' data-le-resize-item="true"' : '';
  const itemsHtml = params.items
    .map((item: ContentItem, index: number) => {
      const rendered = renderContentItem(item, prefix, componentMap);
      const resolved = rendered.resolved;
      const className = resolved.className ? ` ${resolved.className}` : '';
      const fixedSize = normalizeLength((resolved as any).size);
      const minSize = normalizeLength((resolved as any).minSize);
      const maxSize = normalizeLength((resolved as any).maxSize);
      const style = resolved.style ?? {};
      
      // For flex layouts, if width/height is specified in style, use it for flex-basis
      // This ensures proper flex behavior (e.g., sidebar with fixed width in row layout)
      let flexBasisFromStyle: string | undefined;
      if (!fixedSize) {
        if (direction === 'row' && style.width) {
          const normalized = normalizeLength(style.width);
          flexBasisFromStyle = normalized || (typeof style.width === 'string' ? style.width : undefined);
        } else if (direction === 'column' && style.height) {
          const normalized = normalizeLength(style.height);
          flexBasisFromStyle = normalized || (typeof style.height === 'string' ? style.height : undefined);
        }
      }
      
      const flex = fixedSize
        ? `flex:0 0 ${fixedSize};`
        : flexBasisFromStyle
          ? `flex:0 0 ${flexBasisFromStyle};`
          : resolved.span
            ? `flex:${resolved.span} 1 0;`
            : 'flex:1 1 0;'; // Default to flex-grow to fill remaining space when no size is specified
      
      const sizing =
        direction === 'row'
          ? `${minSize ? `min-width:${minSize};` : ''}${maxSize ? `max-width:${maxSize};` : ''}`
          : `${minSize ? `min-height:${minSize};` : ''}${maxSize ? `max-height:${maxSize};` : ''}`;
      
      // Build style string, excluding width/height if we used them for flex-basis
      // (to avoid redundant CSS properties)
      const styleEntries = Object.entries(style).filter(([k]) => {
        if (direction === 'row' && k === 'width' && flexBasisFromStyle) {
          return false; // Already handled by flex-basis
        }
        if (direction === 'column' && k === 'height' && flexBasisFromStyle) {
          return false; // Already handled by flex-basis
        }
        return true;
      });
      
      const styleString = `${flex}${sizing}${styleEntries.map(([k, v]) => `${camelToKebab(k)}:${v}`).join(';')}`;
      const styleAttr = styleString ? ` style="${escapeHtml(styleString)}"` : '';
      if (rendered.css) {nestedCss.push(rendered.css);}
      if (rendered.behaviors.length) {nestedBehaviors.push(...rendered.behaviors);}
      return `<div class="${prefix}-stack-item${className} ${prefix}-util-surface" data-le-item data-le-index="${index}"${resizeAttr}${styleAttr}>${rendered.html}</div>`;
    })
    .join('\n');

  const html = `
    <div class="${prefix}-stack" data-le-layout="stack" data-le-direction="${direction}">
      ${itemsHtml}
    </div>
  `;

  const css = `
    .${prefix}-stack[data-le-direction="${direction}"]{display:flex;flex-direction:${direction};gap:${gap};align-items:${align};justify-content:${justify};flex-wrap:${params.wrap ? 'wrap' : 'nowrap'};}
    .${prefix}-stack-item{min-width:0;min-height:0;}
  `;

  const fullCss = `${css}\n${nestedCss.join('\n')}`;
  
  if (componentMap) {
    componentMap.push({
      elementName: 'stack',
      classes: [`${prefix}-stack`],
      cssVariables: extractCssVariables(fullCss, `\\.${prefix}-stack`, prefix),
      selector: `.${prefix}-stack`,
    });
    componentMap.push({
      elementName: 'stack-item',
      classes: [`${prefix}-stack-item`, `${prefix}-util-surface`],
      cssVariables: extractCssVariables(fullCss, `\\.${prefix}-stack-item`, prefix).concat(
        extractCssVariables(fullCss, `\\.${prefix}-util-surface`, prefix),
      ),
      selector: `.${prefix}-stack-item`,
    });
  }

  return {html, css: fullCss, behaviors: nestedBehaviors, componentMap};
}

function injectRootAttributes(html: string, attributes: Record<string, string | boolean | undefined>) {
  const entries = Object.entries(attributes).filter(([, value]) => value !== undefined);
  if (!entries.length) {
    return html;
  }
  const attrs = entries
    .map(([key, value]) => (typeof value === 'boolean' ? `${key}="${value ? 'true' : 'false'}"` : `${key}="${String(value)}"`))
    .join(' ');
  return html.replace('<div', `<div ${attrs}`);
}

function buildViewerComponent(params: ComponentViewerParams, prefix: string, componentMap?: ComponentMap): RenderedComposition {
  const variant = params.variant ?? 'tabs';
  const orientation = params.orientation ?? 'horizontal';
  const showControls = params.showControls ?? true;
  const showIndicators = params.showIndicators ?? true;
  const ariaLabel = params.ariaLabel ?? 'viewer';
  const nestedCss: string[] = [];
  const nestedBehaviors: BehaviorSpec[] = [];

  const triggersHtml = params.items
    .map((item: any, index: number) => {
      const panelId = `${prefix}-panel-${index}`;
      const triggerId = `${prefix}-trigger-${index}`;
      const label = escapeHtml(item.label);
      const triggerLabel =
        variant === 'carousel' ? `<span class="${prefix}-sr-only">${label}</span>` : label;
      return `
        <button class="${prefix}-viewer-trigger ${prefix}-util-btn" data-le-selectable-item data-le-index="${index}" data-le-target="${panelId}" id="${triggerId}" type="button" aria-label="${label}">
          ${triggerLabel}
        </button>
      `;
    })
    .join('\n');

  const panelsHtml = params.items
    .map((item: any, index: number) => {
      const panelId = `${prefix}-panel-${index}`;
      let contentHtml = '';
      if (typeof item.content === 'string') {
        contentHtml = item.content;
      } else if (item.content && typeof item.content === 'object' && 'composition' in item.content) {
        const nested = renderComposition((item.content as any).composition, prefix, componentMap);
        contentHtml = `<div class="${prefix}-nested">${nested.html}</div>`;
        if (nested.css) {nestedCss.push(nested.css);}
        if (nested.behaviors.length) {nestedBehaviors.push(...nested.behaviors);}
      }
      return `<div class="${prefix}-viewer-panel ${prefix}-util-surface" data-le-selectable-panel data-le-index="${index}" id="${panelId}">${contentHtml}</div>`;
    })
    .join('\n');

  const triggersContainer = `
    <div class="${prefix}-viewer-triggers" data-le-selectable="true" data-le-selectable-list data-le-default-index="0" aria-label="${escapeHtml(ariaLabel)}">
      ${triggersHtml}
    </div>
  `;

  let html = `
    <div class="${prefix}-viewer ${prefix}-viewer--${variant}" data-le-component="viewer" data-le-variant="${variant}" data-le-orientation="${orientation}">
      ${triggersContainer}
      <div class="${prefix}-viewer-panels">
        ${panelsHtml}
      </div>
    </div>
  `;

  if (variant === 'carousel') {
    html = `
      <div class="${prefix}-viewer ${prefix}-viewer--carousel" data-le-component="viewer" data-le-variant="carousel" data-le-orientation="${orientation}">
        <div class="${prefix}-viewer-carousel">
          ${showControls ? `<button class="${prefix}-viewer-control ${prefix}-viewer-prev" data-le-carousel-prev type="button" aria-label="Previous slide">&#8592;</button>` : ''}
          <div class="${prefix}-viewer-viewport">
            <div class="${prefix}-viewer-panels">
              ${panelsHtml}
            </div>
          </div>
          ${showControls ? `<button class="${prefix}-viewer-control ${prefix}-viewer-next" data-le-carousel-next type="button" aria-label="Next slide">&#8594;</button>` : ''}
        </div>
        <div class="${prefix}-viewer-indicators${showIndicators ? '' : ` ${prefix}-viewer-hidden`}">
          ${triggersContainer}
        </div>
      </div>
    `;
  }

  const css = `
    .${prefix}-viewer{display:flex;flex-direction:column;gap:0.5rem;}
    .${prefix}-viewer-triggers{display:flex;gap:0.5rem;flex-wrap:wrap;}
    .${prefix}-viewer-indicators .${prefix}-viewer-triggers{justify-content:center;}
    .${prefix}-viewer-hidden{display:none;}
    .${prefix}-viewer[data-le-orientation="vertical"] .${prefix}-viewer-triggers{flex-direction:column;align-items:stretch;}
    .${prefix}-viewer-trigger{cursor:pointer;border:var(--${prefix}-border-width,1px) solid var(--${prefix}-border);background:var(--${prefix}-surface);color:var(--${prefix}-text);padding:var(--${prefix}-control-padding,0.35rem 0.6rem);border-radius:var(--${prefix}-radius,6px);min-height:var(--${prefix}-control-size,28px);box-shadow:var(--${prefix}-shadow);}
    .${prefix}-viewer--carousel .${prefix}-viewer-trigger{width:12px;height:12px;border-radius:999px;padding:0;background:var(--${prefix}-muted);}
    .${prefix}-viewer--carousel .${prefix}-viewer-trigger.${prefix}-selected{background:var(--${prefix}-accent);border-color:var(--${prefix}-accent);}
    .${prefix}-viewer-trigger.${prefix}-selected{background:var(--${prefix}-accent);color:var(--${prefix}-accent-contrast, #ffffff);border-color:var(--${prefix}-accent);}
    .${prefix}-viewer-panel{padding:0.75rem;border:var(--${prefix}-border-width,1px) solid var(--${prefix}-border);border-radius:var(--${prefix}-radius,6px);background:var(--${prefix}-surface);color:var(--${prefix}-text);box-shadow:var(--${prefix}-shadow);}
    .${prefix}-viewer-panel[hidden]{display:none;}
    .${prefix}-viewer-carousel{display:flex;align-items:center;gap:0.75rem;}
    .${prefix}-viewer-viewport{flex:1;overflow:hidden;}
    .${prefix}-viewer-control{background:var(--${prefix}-surface);border:var(--${prefix}-border-width,1px) solid var(--${prefix}-border);border-radius:6px;padding:0.35rem 0.5rem;cursor:pointer;color:var(--${prefix}-text);box-shadow:var(--${prefix}-shadow);}
    .${prefix}-sr-only{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;}
    .${prefix}-util-btn{background:var(--${prefix}-surface);color:var(--${prefix}-text);border:var(--${prefix}-border-width,1px) solid var(--${prefix}-border);border-radius:var(--${prefix}-radius,6px);box-shadow:var(--${prefix}-shadow);}
    .${prefix}-util-btn-primary{background:var(--${prefix}-accent);color:var(--${prefix}-accent-contrast, #ffffff);border-color:var(--${prefix}-accent);}
    .${prefix}-util-surface{background:var(--${prefix}-surface);color:var(--${prefix}-text);border:var(--${prefix}-border-width,1px) solid var(--${prefix}-border);border-radius:var(--${prefix}-radius,6px);box-shadow:var(--${prefix}-shadow);}
    .${prefix}-util-muted{color:var(--${prefix}-muted);}
  `;

  const fullCss = `${css}\n${nestedCss.join('\n')}`;
  
  if (componentMap) {
    params.items.forEach((item: any, index: number) => {
      const panelId = `${prefix}-panel-${index}`;
      const triggerId = `${prefix}-trigger-${index}`;
      componentMap.push({
        elementName: `viewer-trigger-${index}`,
        id: triggerId,
        classes: [`${prefix}-viewer-trigger`, `${prefix}-util-btn`],
        cssVariables: extractCssVariables(fullCss, `\\.${prefix}-viewer-trigger`, prefix).concat(
          extractCssVariables(fullCss, `\\.${prefix}-util-btn`, prefix),
        ),
        selector: `#${triggerId}`,
      });
      componentMap.push({
        elementName: `viewer-panel-${index}`,
        id: panelId,
        classes: [`${prefix}-viewer-panel`, `${prefix}-util-surface`],
        cssVariables: extractCssVariables(fullCss, `\\.${prefix}-viewer-panel`, prefix).concat(
          extractCssVariables(fullCss, `\\.${prefix}-util-surface`, prefix),
        ),
        selector: `#${panelId}`,
      });
    });
    componentMap.push({
      elementName: 'viewer',
      classes: [`${prefix}-viewer`, `${prefix}-viewer--${variant}`],
      cssVariables: extractCssVariables(fullCss, `\\.${prefix}-viewer`, prefix),
      selector: `.${prefix}-viewer`,
    });
    componentMap.push({
      elementName: 'viewer-triggers',
      classes: [`${prefix}-viewer-triggers`],
      cssVariables: extractCssVariables(fullCss, `\\.${prefix}-viewer-triggers`, prefix),
      selector: `.${prefix}-viewer-triggers`,
    });
    componentMap.push({
      elementName: 'viewer-panels',
      classes: [`${prefix}-viewer-panels`],
      cssVariables: extractCssVariables(fullCss, `\\.${prefix}-viewer-panels`, prefix),
      selector: `.${prefix}-viewer-panels`,
    });
    if (variant === 'carousel') {
      componentMap.push({
        elementName: 'viewer-carousel',
        classes: [`${prefix}-viewer-carousel`],
        cssVariables: extractCssVariables(fullCss, `\\.${prefix}-viewer-carousel`, prefix),
        selector: `.${prefix}-viewer-carousel`,
      });
      componentMap.push({
        elementName: 'viewer-control',
        classes: [`${prefix}-viewer-control`],
        cssVariables: extractCssVariables(fullCss, `\\.${prefix}-viewer-control`, prefix),
        selector: `.${prefix}-viewer-control`,
      });
    }
  }

  return {html, css: fullCss, behaviors: nestedBehaviors, componentMap};
}

function renderComposition(composition: any, prefix: string, componentMap?: ComponentMap): RenderedComposition {
  if (!composition || typeof composition !== 'object') {
    return {html: '', css: '', behaviors: [], componentMap};
  }
  if (composition.type === 'layout_parametric_grid') {
    const result = buildGridLayout(composition, prefix, componentMap);
    const behaviors = [...(composition.behaviors ?? []), ...result.behaviors];
    return {html: result.html, css: result.css, behaviors, componentMap: result.componentMap};
  }
  if (composition.type === 'layout_parametric_stack') {
    const behaviors = [...(composition.behaviors ?? [])];
    const enableResize = behaviors.some(behavior => behavior.type === 'behavior_drag_resize');
    const result = buildStackLayout(composition, prefix, {enableResize, componentMap});
    const updatedHtml = enableResize
      ? injectRootAttributes(result.html, {
          'data-le-resize': true,
          'data-le-direction': composition.direction ?? 'row',
        })
      : result.html;
    return {html: updatedHtml, css: result.css, behaviors: [...behaviors, ...result.behaviors], componentMap: result.componentMap};
  }
  if (composition.type === 'component_parametric_viewer') {
    const result = buildViewerComponent(composition, prefix, componentMap);
    const behaviors = [...(composition.behaviors ?? []), ...result.behaviors];
    return {html: result.html, css: result.css, behaviors, componentMap: result.componentMap};
  }
  return {html: '', css: '', behaviors: [], componentMap};
}

function mergeBehaviors(
  compositionBehaviors: BehaviorSpec[] | undefined,
  topLevelBehaviors: BehaviorSpec[] | undefined,
): BehaviorSpec[] {
  return [...(compositionBehaviors ?? []), ...(topLevelBehaviors ?? [])];
}

function buildBehaviorScript(options: {
  patchId: string;
  rootId: string;
  prefix: string;
  behaviors: BehaviorSpec[];
}) {
  const {patchId, rootId, prefix, behaviors} = options;
  const hasSelectable = behaviors.some(b => b.type === 'behavior_selectable');
  const hasRoving = behaviors.some(b => b.type === 'behavior_roving_focus');
  const ariaPattern = behaviors.find(b => b.type === 'behavior_aria_pattern')?.params?.pattern;
  const dragResizeBehavior = behaviors.find(b => b.type === 'behavior_drag_resize');
  const hasDragResize = Boolean(dragResizeBehavior);
  const dragResizeParams = dragResizeBehavior?.params ?? {};
  const selectableParams = behaviors.find(b => b.type === 'behavior_selectable')?.params ?? {};
  const rovingParams = behaviors.find(b => b.type === 'behavior_roving_focus')?.params ?? {};

  if (!hasSelectable && !hasRoving && !ariaPattern && !hasDragResize) {
    return '';
  }

  return `
  (() => {
    const PATCH_ID = ${JSON.stringify(patchId)};
    const ROOT_ID = ${JSON.stringify(rootId)};
    const PREFIX = ${JSON.stringify(prefix)};
    const registry = (window.__MCP_LAYOUT_LIVE_EDITING__ = window.__MCP_LAYOUT_LIVE_EDITING__ || {cleanups: {}});
    if (registry.cleanups[PATCH_ID]) {
      registry.cleanups[PATCH_ID]();
      delete registry.cleanups[PATCH_ID];
    }
    const root = document.getElementById(ROOT_ID);
    if (!root) {return;}
    const listeners = [];
    const handles = [];
    const addListener = (el, type, handler, options) => {
      el.addEventListener(type, handler, options);
      listeners.push({el, type, handler, options});
    };
    const cleanup = () => {
      listeners.forEach(({el, type, handler, options}) => {
        el.removeEventListener(type, handler, options);
      });
      handles.forEach(handle => handle.remove());
    };

    const applySelectable = (container) => {
      const items = Array.from(container.querySelectorAll('[data-le-selectable-item]'));
      const panels = Array.from(container.closest('#' + ROOT_ID)?.querySelectorAll('[data-le-selectable-panel]') || []);
      const multiSelect = ${Boolean(selectableParams?.multiSelect)};
      const defaultIndexAttr = container.getAttribute('data-le-default-index');
      const defaultIndex = defaultIndexAttr ? Number(defaultIndexAttr) : ${Number(selectableParams?.defaultSelectedIndex ?? 0)};

      const setSelected = (index, toggle) => {
        items.forEach((item, i) => {
          const isSelected = i === index ? (!multiSelect ? true : toggle ? !item.classList.contains(PREFIX + '-selected') : true) : (multiSelect ? item.classList.contains(PREFIX + '-selected') : false);
          item.classList.toggle(PREFIX + '-selected', isSelected);
          item.setAttribute('aria-selected', String(isSelected));
          item.tabIndex = isSelected ? 0 : -1;
          const targetId = item.getAttribute('data-le-target');
          if (targetId) {
            const panel = document.getElementById(targetId);
            if (panel) {
              panel.toggleAttribute('hidden', !isSelected);
              panel.setAttribute('aria-hidden', String(!isSelected));
            }
          }
        });
      };

      const getSelectedIndex = () => {
        const selected = items.findIndex(item => item.classList.contains(PREFIX + '-selected'));
        return selected >= 0 ? selected : 0;
      };

      items.forEach((item, index) => {
        addListener(item, 'click', () => {
          setSelected(index, true);
        });
      });

      if (items.length > 0) {
        setSelected(Math.max(0, Math.min(defaultIndex, items.length - 1)), false);
      }

      const viewer = container.closest('[data-le-variant="carousel"]');
      if (viewer) {
        const nextButton = viewer.querySelector('[data-le-carousel-next]');
        const prevButton = viewer.querySelector('[data-le-carousel-prev]');
        if (nextButton) {
          addListener(nextButton, 'click', () => {
            const current = getSelectedIndex();
            const next = (current + 1) % items.length;
            setSelected(next, false);
            items[next]?.focus();
          });
        }
        if (prevButton) {
          addListener(prevButton, 'click', () => {
            const current = getSelectedIndex();
            const prev = (current - 1 + items.length) % items.length;
            setSelected(prev, false);
            items[prev]?.focus();
          });
        }
      }
    };

    const applyRovingFocus = (container) => {
      const items = Array.from(container.querySelectorAll('[data-le-selectable-item]'));
      if (items.length === 0) {return;}
      const axis = ${JSON.stringify(rovingParams?.axis ?? 'both')};
      const loop = ${Boolean(rovingParams?.loop ?? true)};
      addListener(container, 'keydown', (event) => {
        const key = event.key;
        const horizontal = key === 'ArrowLeft' || key === 'ArrowRight';
        const vertical = key === 'ArrowUp' || key === 'ArrowDown';
        if ((axis === 'x' && !horizontal) || (axis === 'y' && !vertical)) {
          return;
        }
        if (!horizontal && !vertical) {return;}
        const active = document.activeElement;
        const currentIndex = items.indexOf(active);
        if (currentIndex === -1) {return;}
        event.preventDefault();
        const delta = key === 'ArrowLeft' || key === 'ArrowUp' ? -1 : 1;
        let nextIndex = currentIndex + delta;
        if (loop) {
          nextIndex = (nextIndex + items.length) % items.length;
        } else {
          nextIndex = Math.max(0, Math.min(items.length - 1, nextIndex));
        }
        items[nextIndex]?.focus();
      });
    };

    const applyAriaPattern = (container) => {
      const pattern = ${JSON.stringify(ariaPattern ?? '')};
      if (!pattern) {return;}
      if (pattern === 'tabs') {
        container.setAttribute('role', 'tablist');
        const items = Array.from(container.querySelectorAll('[data-le-selectable-item]'));
        items.forEach((item) => {
          item.setAttribute('role', 'tab');
          const targetId = item.getAttribute('data-le-target');
          if (targetId) {
            item.setAttribute('aria-controls', targetId);
            const panel = document.getElementById(targetId);
            if (panel) {
              panel.setAttribute('role', 'tabpanel');
              panel.setAttribute('tabindex', '0');
            }
          }
        });
      }
    };

    const parseLength = (value) => {
      if (typeof value === 'number') {return value;}
      if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed.endsWith('px')) {
          const parsed = Number(trimmed.slice(0, -2));
          return Number.isFinite(parsed) ? parsed : null;
        }
        const numeric = Number(trimmed);
        return Number.isFinite(numeric) ? numeric : null;
      }
      return null;
    };

    const applyDragResize = (container) => {
      const items = Array.from(container.querySelectorAll('[data-le-resize-item]'));
      if (items.length < 2) {return;}
      const axisParam = ${JSON.stringify(dragResizeParams?.axis ?? 'both')};
      const direction = container.getAttribute('data-le-direction') || 'row';
      const axis = axisParam === 'both' ? (direction === 'column' ? 'y' : 'x') : axisParam;
      const handleSize = parseLength(${JSON.stringify(dragResizeParams?.handleSize ?? 6)}) ?? 6;
      const minSize = parseLength(${JSON.stringify(dragResizeParams?.minSize ?? '')});
      const maxSize = parseLength(${JSON.stringify(dragResizeParams?.maxSize ?? '')});

      const clamp = (value) => {
        let next = value;
        if (Number.isFinite(minSize)) {
          next = Math.max(next, minSize);
        }
        if (Number.isFinite(maxSize)) {
          next = Math.min(next, maxSize);
        }
        return next;
      };

      items.forEach((item, index) => {
        if (index === items.length - 1) {return;}
        const handle = document.createElement('div');
        handle.className = PREFIX + '-resize-handle';
        handle.setAttribute('data-le-resize-handle', String(index));
        handle.style.flex = '0 0 ' + handleSize + 'px';
        handle.style.alignSelf = 'stretch';
        handle.style.cursor = axis === 'y' ? 'row-resize' : 'col-resize';
        handle.style.userSelect = 'none';
        handle.style.touchAction = 'none';
        item.insertAdjacentElement('afterend', handle);
        handles.push(handle);

        let start = 0;
        let startPrev = 0;
        let startNext = 0;
        const prev = item;
        const next = items[index + 1];

        const onMove = (event) => {
          const delta = axis === 'y' ? event.clientY - start : event.clientX - start;
          const prevSize = clamp(startPrev + delta);
          const nextSize = clamp(startNext - delta);
          if (prevSize <= 0 || nextSize <= 0) {return;}
          prev.style.flex = '0 0 ' + prevSize + 'px';
          next.style.flex = '0 0 ' + nextSize + 'px';
        };

        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };

        addListener(handle, 'pointerdown', (event) => {
          event.preventDefault();
          const prevRect = prev.getBoundingClientRect();
          const nextRect = next.getBoundingClientRect();
          start = axis === 'y' ? event.clientY : event.clientX;
          startPrev = axis === 'y' ? prevRect.height : prevRect.width;
          startNext = axis === 'y' ? nextRect.height : nextRect.width;
          window.addEventListener('pointermove', onMove);
          window.addEventListener('pointerup', onUp);
        });
      });
    };

    const selectableContainers = Array.from(root.querySelectorAll('[data-le-selectable="true"]'));
    selectableContainers.forEach(container => {
      ${hasSelectable ? 'applySelectable(container);' : ''}
      ${hasRoving ? 'applyRovingFocus(container);' : ''}
      ${ariaPattern ? 'applyAriaPattern(container);' : ''}
    });

    const resizableContainers = Array.from(root.querySelectorAll('[data-le-resize="true"]'));
    resizableContainers.forEach(container => {
      ${hasDragResize ? 'applyDragResize(container);' : ''}
    });

    registry.cleanups[PATCH_ID] = cleanup;
  })();
  `;
}

function scopeCss(css: string, scope: string): string {
  return css
    .split('\n')
    .map(line => {
      const trimmed = line.trim();
      if (!trimmed.startsWith('.') || !trimmed.includes('{')) {
        return line;
      }
      const [selector, rest] = line.split('{');
      const scopedSelector = selector
        .split(',')
        .map(part => `${scope} ${part.trim()}`)
        .join(', ');
      return `${scopedSelector}{${rest}`;
    })
    .join('\n');
}

function normalizeSpans(
  spans: Array<number> | undefined,
  itemCount: number,
  label: string,
): number[] {
  const resolved = spans ?? Array.from({length: itemCount}, () => 1);
  if (resolved.length !== itemCount) {
    throw new Error(`Span count mismatch for ${label}: expected ${itemCount}, got ${resolved.length}.`);
  }
  resolved.forEach((span, index) => {
    if (!Number.isFinite(span) || span <= 0) {
      throw new Error(`Invalid span for ${label} item ${index}: ${span}.`);
    }
  });
  return resolved;
}

function themePreset(intent: string | undefined) {
  switch (intent) {
    case 'industrial':
      return {
        background: '#0f1115',
        surface: '#1a1f26',
        accent: '#4a90e2',
        text: '#e5e7eb',
        border: '#2a3038',
        muted: '#9ca3af',
        shadow: '0 1px 2px rgba(0, 0, 0, 0.6)',
      };
    case 'system':
      return {
        background: '#f5f5f5',
        surface: '#ffffff',
        accent: '#2563eb',
        text: '#111827',
        border: '#e5e7eb',
        muted: '#6b7280',
        shadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
      };
    case 'glass':
      return {
        background: 'rgba(15, 23, 42, 0.65)',
        surface: 'rgba(30, 41, 59, 0.55)',
        accent: '#38bdf8',
        text: '#f8fafc',
        border: 'rgba(148, 163, 184, 0.4)',
        muted: '#cbd5f5',
        shadow: '0 6px 16px rgba(15, 23, 42, 0.35)',
      };
    case 'utility':
    default:
      return {
        background: '#f8fafc',
        surface: '#ffffff',
        accent: '#2563eb',
        text: '#111827',
        border: '#d1d5db',
        muted: '#6b7280',
        shadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
      };
  }
}

function visualWeightDefaults(weight: string | undefined) {
  switch (weight) {
    case 'skeuomorphic':
      return {
        borderWidth: '1px',
        shadow: 'inset 0 1px 1px rgba(255,255,255,0.15), inset 0 -1px 2px rgba(0,0,0,0.4)',
        depth1: 'inset 0 1px 1px rgba(255,255,255,0.12), inset 0 -1px 2px rgba(0,0,0,0.35)',
        depth2: '0 2px 6px rgba(0,0,0,0.55)',
      };
    case 'elevated':
      return {
        borderWidth: '1px',
        shadow: '0 6px 14px rgba(15, 23, 42, 0.25)',
        depth1: '0 2px 6px rgba(15, 23, 42, 0.18)',
        depth2: '0 10px 24px rgba(15, 23, 42, 0.28)',
      };
    case 'flat':
    default:
      return {
        borderWidth: '1px',
        shadow: 'none',
        depth1: 'none',
        depth2: 'none',
      };
  }
}

function interactionDefaults(model: string | undefined) {
  switch (model) {
    case 'touch':
      return {controlSize: '44px', controlPadding: '0.55rem 0.9rem'};
    case 'kiosk':
      return {controlSize: '56px', controlPadding: '0.75rem 1.1rem'};
    case 'precision':
    default:
      return {controlSize: '28px', controlPadding: '0.35rem 0.6rem'};
  }
}

export const layoutAtomRegistry = {
  layout_parametric_grid: {
    name: 'layout_parametric_grid',
    description: 'Grid layout with spans, gaps, and optional overlay layers.',
    schema: layoutParametricGridSchema,
  },
  layout_parametric_stack: {
    name: 'layout_parametric_stack',
    description: 'Flexbox-based stack layout with direction, gap, and alignment.',
    schema: layoutParametricStackSchema,
  },
} as const;

export const behaviorModuleRegistry = {
  behavior_selectable: {
    name: 'behavior_selectable',
    description: 'Selection state and activation behavior for items.',
    schema: behaviorSelectableSchema,
  },
  behavior_roving_focus: {
    name: 'behavior_roving_focus',
    description: 'Roving focus keyboard navigation for item sets.',
    schema: behaviorRovingFocusSchema,
  },
  behavior_aria_pattern: {
    name: 'behavior_aria_pattern',
    description: 'ARIA pattern application (tabs, listbox, menu, etc.).',
    schema: behaviorAriaPatternSchema,
  },
  behavior_drag_resize: {
    name: 'behavior_drag_resize',
    description: 'Drag-to-resize handles for split panes.',
    schema: behaviorDragResizeSchema,
  },
} as const;

export const componentRegistry = {
  component_parametric_viewer: {
    name: 'component_parametric_viewer',
    description: 'Selectable viewer that can produce tabs/carousel-like UIs.',
    schema: componentParametricViewerSchema,
  },
} as const;

// Recipe registry is now imported from ./recipes/index.js

export const layoutLiveEditingRecipeCatalogSchema = {
  recipe: recipeNameSchema.optional().describe('Optional recipe name to filter results.'),
};

export async function layoutLiveEditingRecipeCatalogHandler(
  request: {
    params: zod.objectOutputType<typeof layoutLiveEditingRecipeCatalogSchema, zod.ZodTypeAny>;
  },
  response: Response,
  context: Context,
) {
  const filter = request.params.recipe;
  const recipes = Object.values(recipeRegistry)
    .filter(recipe => (filter ? recipe.name === filter : true))
    .map(recipe => ({
      name: recipe.name,
      description: recipe.description,
      params: summarizeRecipeSchema(recipe.schema),
    }));
  response.appendResponseLine('```json');
  response.appendResponseLine(JSON.stringify({recipes}, null, 2));
  response.appendResponseLine('```');
}

export const layoutLiveEditing = defineTool({
  name: 'layout_live_editing',
  description:
    'Generate a parametric layout in the live browser using layout atoms, behavior modules, and component compositions. Use either a recipe (preset) or one of the flattened composition parameters: parametric_grid, parametric_stack, or component_parametric_viewer.\n\n' +
    '**Content Migration:** When using the `selectable_view` recipe, the `contents` parameter supports both static HTML strings and selector objects to migrate existing DOM elements into tab panels. Use `{selector: "css-selector", preserveEvents: true, hideOriginal: true}` to move existing content atomically.\n\n' +
    '**SVG Snapshots:** By default, this tool includes an SVG wireframe snapshot after applying layout changes (via `verify.svgSnapshot`, which defaults to `true`) to provide visual confirmation of the created or modified layout. Set `verify: { svgSnapshot: false }` to disable.',
  annotations: {
    category: ToolCategory.PATCH,
    readOnlyHint: false,
  },
  schema: {
    target: targetSchema.optional(),
    root: rootSchema.optional(),
    mode: zod
      .enum(['apply', 'preview', 'export_only'])
      .optional()
      .default('apply')
      .describe('apply: modify page, preview: apply then rollback, export_only: generate output only.'),
    catalog: zod
      .object(layoutLiveEditingRecipeCatalogSchema as Record<string, any>)
      .optional()
      .describe('List layout_live_editing recipes and summarize their parameter schemas.'),
    recipe: recipeNameSchema.optional().describe('Named recipe/preset to use. When using a recipe, pass its parameters directly at the top level (not nested in recipeParams).'),
    // Recipe parameters are flattened to top level - all optional
    rows: zod.union([
      zod.array(gridRowSchema).min(1),
      zod.number().int().positive(),
    ]).optional().describe('Recipe parameter: For parametric_grid/overlay_grid: Array of grid row objects. For grid_canvas: Number of rows (positive integer).'),
    itemsForAllRows: zod.array(contentItemSchema).min(1).optional().describe('Recipe parameter for parametric_grid: Flat array of items for all rows (requires columnCount). Alternative to rows parameter.'),
    columnCount: zod.number().int().positive().optional().describe('Recipe parameter for parametric_grid, overlay_grid: Number of columns in the grid. Required when using itemsForAllRows.'),
    unit: lengthSchema.optional().describe('Recipe parameter for parametric_grid, overlay_grid: Base unit size (e.g., "1fr", "240px").'),
    gap: lengthSchema.optional().describe('Recipe parameter for parametric_grid, overlay_grid: Gap shorthand - sets both columnGap and rowGap to the same value.'),
    columnGap: lengthSchema.optional().describe('Recipe parameter for parametric_grid, overlay_grid: Gap between columns.'),
    rowGap: lengthSchema.optional().describe('Recipe parameter for parametric_grid, overlay_grid: Gap between rows.'),
    rowHeight: lengthSchema.optional().describe('Recipe parameter for parametric_grid, overlay_grid: Fixed row height for all rows.'),
    rowMinHeight: lengthSchema.optional().describe('Recipe parameter for parametric_grid, overlay_grid: Minimum row height for all rows.'),
    rowLayout: zod.enum(['grid', 'flex']).optional().describe('Recipe parameter for parametric_grid, overlay_grid: Row layout mode ("grid" for CSS grid, "flex" for flex row).'),
    layers: zod.array(gridOverlayLayerSchema).min(1).optional().describe('Recipe parameter for overlay_grid: Array of overlay layer objects with items and optional offset/zIndex.'),
    labels: zod.array(zod.string()).min(1).optional().describe('Recipe parameter for selectable_view: Array of tab/panel labels. REQUIRED when recipe="selectable_view". Must match length of contents array.'),
    contents: zod.union([
      zod.array(zod.string()).min(1),
      zod.array(zod.object({
        selector: zod.string().describe('CSS selector to move existing DOM element into this panel.'),
        preserveEvents: zod.boolean().optional().default(true).describe('Whether to preserve event listeners when moving (default: true).'),
        hideOriginal: zod.boolean().optional().default(true).describe('Whether to hide the original element after moving (default: true).'),
      })).min(1),
    ]).optional().describe('Recipe parameter for selectable_view: Array of panel content strings OR selector objects to migrate existing DOM elements. REQUIRED when recipe="selectable_view". Must match length of labels array.'),
    orientation: zod.enum(['horizontal', 'vertical']).optional().describe('Recipe parameter for selectable_view: Orientation of the trigger list ("horizontal" or "vertical").'),
    variant: zod.enum(['tabs', 'carousel']).optional().describe('Recipe parameter for selectable_view: Presentation variant ("tabs" or "carousel", defaults to "tabs").'),
    showControls: zod.coerce.boolean().optional().describe('Recipe parameter for selectable_view: Whether carousel prev/next controls are shown (carousel variant only).'),
    showIndicators: zod.coerce.boolean().optional().describe('Recipe parameter for selectable_view: Whether carousel indicators are shown (carousel variant only).'),
    headerHeight: lengthSchema.optional().describe('Recipe parameter for app_shell: Header height (number interpreted as px, or CSS length string).'),
    sidebarWidth: lengthSchema.optional().describe('Recipe parameter for app_shell, two_column: Sidebar width (number interpreted as px, or CSS length string).'),
    showFooter: zod.coerce.boolean().optional().describe('Recipe parameter for app_shell: Whether to show the footer.'),
    footerHeight: lengthSchema.optional().describe('Recipe parameter for app_shell: Footer height (number interpreted as px, or CSS length string).'),
    minHeight: lengthSchema.optional().describe('Recipe parameter for app_shell, two_column, three_panel: Minimum height (number interpreted as px, or CSS length string).'),
    navWidth: lengthSchema.optional().describe('Recipe parameter for three_panel: Navigation panel width (number interpreted as px, or CSS length string).'),
    inspectorWidth: lengthSchema.optional().describe('Recipe parameter for three_panel: Inspector panel width (number interpreted as px, or CSS length string).'),
    groups: zod.array(zod.object({
      label: zod.string().optional(),
      items: zod.array(zod.string()).min(1),
    })).min(1).optional().describe('Recipe parameter for toolbar: Array of toolbar group objects, each with optional label and items array.'),
    columns: zod.number().int().positive().optional().describe('Recipe parameter for grid_canvas: Number of columns in the grid canvas.'),
    cellSize: lengthSchema.optional().describe('Recipe parameter for grid_canvas: Size of each grid cell (number interpreted as px, or CSS length string).'),
    showGrid: zod.coerce.boolean().optional().describe('Recipe parameter for grid_canvas: Whether to show grid lines.'),
    parametric_grid: layoutParametricGridSchema
      .optional()
      .describe(
        'Create a parametric grid layout. ' +
        'Required: either rows (array of row objects with items) or itemsForAllRows (flat array of items, requires columnCount). ' +
        'Optional: columnCount (number, required with itemsForAllRows), gap (string, shorthand for both columnGap and rowGap), columnGap (string), rowGap (string), unit (string), ' +
        'rowHeight (string), rowMinHeight (string), rowLayout ("grid"|"flex"), ' +
        'layers (array of overlay layers). ' +
        'Example with rows: { rows: [{ items: ["A", "B", "C"] }, { items: ["D", "E"] }], columnCount: 3, gap: "8px" } ' +
        'Example with itemsForAllRows: { itemsForAllRows: ["A", "B", "C", "D", "E"], columnCount: 3, columnGap: "8px", rowGap: "4px" }',
      ),
    parametric_stack: layoutParametricStackSchema
      .optional()
      .describe(
        'Create a parametric stack layout. ' +
        'Required: items (array). ' +
        'Optional: direction ("row"|"column", default: "row"), gap (string), ' +
        'align ("start"|"center"|"end"|"stretch"), justify ("start"|"center"|"end"|"between"|"around"|"evenly"), ' +
        'wrap (boolean). ' +
        'Example: { direction: "row", gap: "16px", items: ["Item 1", "Item 2", "Item 3"] }',
      ),
    component_parametric_viewer: componentParametricViewerSchema
      .optional()
      .describe(
        'Create a parametric viewer component (tabs/carousel). ' +
        'Required: items (array of objects with label and content). ' +
        'Optional: variant ("tabs"|"carousel"), orientation ("horizontal"|"vertical"), ' +
        'showControls (boolean), showIndicators (boolean), ariaLabel (string). ' +
        'Example: { variant: "tabs", items: [{ label: "Tab 1", content: "<p>Content 1</p>" }] }',
      ),
    ariaPattern: zod
      .enum(['tabs', 'listbox', 'menu', 'grid', 'toolbar', 'radiogroup'])
      .optional()
      .describe(
        'ARIA pattern to apply (flattened alternative to behaviors array). ' +
        'Example: "tabs" for tab navigation pattern. ' +
        'This is easier to use than the nested behaviors array format.',
      ),
    selectable: zod
      .object({
        multiSelect: zod.boolean().optional().describe('Allow multiple selections.'),
        defaultSelectedIndex: zod
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Index of the initially selected item.'),
        onActivate: zod
          .string()
          .optional()
          .describe('Action identifier to invoke when an item is activated.'),
      })
      .optional()
      .describe(
        'Selection behavior (flattened alternative to behaviors array). ' +
        'Example: { multiSelect: false, defaultSelectedIndex: 0 }',
      ),
    rovingFocus: zod
      .object({
        axis: zod
          .enum(['x', 'y', 'both'])
          .optional()
          .describe('Arrow-key navigation axis.'),
        loop: zod
          .boolean()
          .optional()
          .describe('Wrap focus at the ends of the list.'),
      })
      .optional()
      .describe(
        'Roving focus behavior (flattened alternative to behaviors array). ' +
        'Example: { axis: "x", loop: true }',
      ),
    dragResize: zod
      .object({
        axis: zod
          .enum(['x', 'y', 'both'])
          .optional()
          .describe('Resize axis for drag handles.'),
        minSize: lengthSchema.optional().describe('Minimum size for resizable panes.'),
        maxSize: lengthSchema.optional().describe('Maximum size for resizable panes.'),
        handleSize: lengthSchema.optional().describe('Size of drag handle.'),
      })
      .optional()
      .describe(
        'Drag-to-resize behavior (flattened alternative to behaviors array). ' +
        'Example: { axis: "x", minSize: "100px", maxSize: "500px" }',
      ),
    behaviors: zod
      .array(behaviorSchema)
      .optional()
      .describe(
        'Top-level behaviors to attach to the composition (legacy format). ' +
        'For easier use, prefer flattened parameters: ariaPattern, selectable, rovingFocus, dragResize. ' +
        'Both formats can be used together - flattened params are converted first, then array behaviors are added.',
      ),
    theme: themeSchema.optional(),
    patch: patchSchema.optional(),
    verify: verifySchema.optional(),
    componentMapMode: zod
      .enum(['summary', 'full'])
      .default('full')
      .optional()
      .describe('Component map output mode: "summary" shows only key elements overview, "full" shows detailed component listing with all properties.'),
  },
  handler: async (request, response, context) => {
    const catalog = (request.params as any).catalog;
    if (catalog) {
      await layoutLiveEditingRecipeCatalogHandler({params: catalog as any}, response, context);
      return;
    }

    const hasRecipe = Boolean(request.params.recipe);
    const parametricGrid = (request.params as any).parametric_grid;
    const parametricStack = (request.params as any).parametric_stack;
    const componentViewer = (request.params as any).component_parametric_viewer;
    const hasComposition = Boolean(parametricGrid || parametricStack || componentViewer);
    
    if (!hasRecipe && !hasComposition) {
      throw new Error('Provide either recipe (with flattened parameters) or one of: parametric_grid, parametric_stack, component_parametric_viewer.');
    }

    if (hasComposition) {
      const provided = [parametricGrid, parametricStack, componentViewer].filter(Boolean).length;
      if (provided > 1) {
        throw new Error('Provide exactly one of: parametric_grid, parametric_stack, component_parametric_viewer.');
      }
    }

    // Validate and construct composition from flattened parameters
    let validatedComposition: any = undefined;
    if (hasComposition) {
      try {
        let compositionToValidate: any;
        
        if (parametricGrid) {
          // Convert itemsForAllRows to rows if provided
          const gridParams = {...parametricGrid};
          if (gridParams.itemsForAllRows) {
            // Auto-calculate columnCount from minItemWidth if provided
            if (gridParams.minItemWidth && !gridParams.columnCount) {
              const page = context.getSelectedPage();
              const viewport = await page.viewport();
              const viewportWidth = viewport?.width ?? 1200;
              
              // Parse minItemWidth (supports CSS length values or numbers)
              let minWidthPx: number;
              if (typeof gridParams.minItemWidth === 'number') {
                minWidthPx = gridParams.minItemWidth;
              } else {
                const minWidthStr = String(gridParams.minItemWidth).trim();
                // Parse CSS length values (e.g., "240px", "20rem")
                if (minWidthStr.endsWith('px')) {
                  minWidthPx = Number.parseFloat(minWidthStr.slice(0, -2));
                } else if (minWidthStr.endsWith('rem')) {
                  // Assume 16px = 1rem
                  minWidthPx = Number.parseFloat(minWidthStr.slice(0, -3)) * 16;
                } else if (minWidthStr.endsWith('em')) {
                  minWidthPx = Number.parseFloat(minWidthStr.slice(0, -2)) * 16;
                } else {
                  // Try parsing as number
                  minWidthPx = Number.parseFloat(minWidthStr);
                }
              }
              
              if (Number.isFinite(minWidthPx) && minWidthPx > 0) {
                // Account for gaps (estimate based on columnGap or gap)
                const gap = gridParams.columnGap || gridParams.gap || '8px';
                const gapPx = typeof gap === 'string' && gap.endsWith('px') 
                  ? Number.parseFloat(gap.slice(0, -2)) 
                  : 8;
                
                // Calculate how many items fit: (viewportWidth - gaps) / (minItemWidth + gap)
                const itemsPerRow = Math.floor((viewportWidth - gapPx) / (minWidthPx + gapPx));
                gridParams.columnCount = Math.max(1, itemsPerRow);
                
                response.appendResponseLine(`📐 Auto-calculated columnCount: ${gridParams.columnCount} (based on minItemWidth: ${gridParams.minItemWidth}, viewport: ${viewportWidth}px)`);
              } else {
                throw new Error(`Invalid minItemWidth value: ${gridParams.minItemWidth}. Must be a positive number or CSS length (e.g., "240px").`);
              }
            }
            
            gridParams.rows = convertItemsForAllRowsToRows(
              gridParams.itemsForAllRows,
              gridParams.columnCount,
            );
            // Remove itemsForAllRows from params since we've converted it to rows
            delete gridParams.itemsForAllRows;
            delete gridParams.minItemWidth; // Remove from composition since it's only used for calculation
          }
          compositionToValidate = {
            type: 'layout_parametric_grid',
            ...gridParams,
          };
        } else if (parametricStack) {
          compositionToValidate = {
            type: 'layout_parametric_stack',
            ...parametricStack,
          };
        } else if (componentViewer) {
          compositionToValidate = {
            type: 'component_parametric_viewer',
            ...componentViewer,
          };
        } else {
          throw new Error('Invalid composition parameter state.');
        }

        // Validate against the full schema
        const compositionResult = compositionSchema.safeParse(compositionToValidate);
        if (!compositionResult.success) {
          const formattedError = formatCompositionValidationError(compositionResult.error);
          throw new Error(formattedError);
        }
        validatedComposition = compositionResult.data;
      } catch (e) {
        if (e instanceof Error && e.message.includes('Composition validation failed')) {
          throw e;
        }
        if (e instanceof zod.ZodError) {
          const formattedError = formatCompositionValidationError(e);
          throw new Error(formattedError);
        }
        throw new Error(
          `Invalid composition: ${e instanceof Error ? e.message : String(e)}`
        );
      }
    }

    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;
    const mode = request.params.mode ?? 'apply';
    const patch = request.params.patch ?? {};
    const target = request.params.target ?? {selector: 'body', position: 'beforeend'};
    const root = request.params.root ?? {};
    const prefix = root.classPrefix ?? 'mcp-le';
    const rootId = root.id ?? 'mcp-layout-root';
    const scopeSelector = root.scopeSelector ?? `#${rootId}`;
    const patchIdPrefix = patch.patchIdPrefix ?? 'layout-live-editing';
    const domPatchId = `${patchIdPrefix}-dom`;
    const cssPatchId = `${patchIdPrefix}-css`;
    const jsPatchId = `${patchIdPrefix}-js`;
    const replaceExisting = patch.replaceExisting ?? false;
    // Default to 'merge' for safer CSS updates (preserves existing styles)
    // Only use 'replace' if explicitly requested via replaceExisting: true
    const cssMode = patch.cssMode ?? (replaceExisting ? 'replace' : 'merge');
    const recordToSession = patch.recordToSession ?? false;
    const editSessionId = patch.editSessionId;

    // Helper function to extract recipe parameters from top-level params
    const extractRecipeParams = (): Record<string, any> => {
      const knownParams = new Set([
        'target', 'root', 'mode', 'catalog', 'recipe',
        'parametric_grid', 'parametric_stack', 'component_parametric_viewer',
        'behaviors', 'ariaPattern', 'selectable', 'rovingFocus', 'dragResize',
        'theme', 'patch', 'verify'
      ]);
      const recipeParams: Record<string, any> = {};
      for (const [key, value] of Object.entries(request.params)) {
        if (!knownParams.has(key) && value !== undefined) {
          recipeParams[key] = value;
        }
      }
      return recipeParams;
    };

    if (hasRecipe && request.params.recipe) {
      const registry = recipeRegistry[request.params.recipe];
      if (!registry) {
        throw new Error(`Unknown recipe: ${request.params.recipe}`);
      }
      const recipeParams = extractRecipeParams();
      const parsed = registry.schema.safeParse(recipeParams);
      if (!parsed.success) {
        throw new Error(`Invalid parameters for recipe ${request.params.recipe}: ${parsed.error.message}`);
      }
    }

    // Use validated composition (already parsed and validated above)
    let resolvedComposition = validatedComposition;
    
    // Convert flattened behavior parameters to behaviors array format
    const flattenedBehaviors = convertFlattenedBehaviorsToArray(request.params);
    const arrayBehaviors = request.params.behaviors ?? [];
    let resolvedBehaviors = [...flattenedBehaviors, ...arrayBehaviors];

    let contentMigration: Array<{panelIndex: number; selector: string; preserveEvents: boolean; hideOriginal: boolean}> | undefined;
    if (request.params.recipe) {
      const recipeParams = extractRecipeParams();
      const recipe = recipeRegistry[request.params.recipe];
      if (!recipe) {
        throw new Error(`Unknown recipe: ${request.params.recipe}`);
      }
      const result = recipe.execute(recipeParams, prefix);
      resolvedComposition = result.composition;
      resolvedBehaviors = [...result.behaviors, ...resolvedBehaviors];
      contentMigration = (result as any).contentMigration;
    }

    if (!resolvedComposition) {
      throw new Error('No composition resolved after recipe expansion.');
    }

    const componentMap: ComponentMap = [];
    const rendered = renderComposition(resolvedComposition, prefix, componentMap);
    const layoutHtml = rendered.html;
    const layoutCss = rendered.css;
    const combinedBehaviors = mergeBehaviors(rendered.behaviors, resolvedBehaviors);
    const behaviorScript = buildBehaviorScript({
      patchId: jsPatchId,
      rootId,
      prefix,
      behaviors: combinedBehaviors,
    });

    const theme = request.params.theme ?? {};
    const radius = theme.radius ?? 8;
    const spacing = normalizeLength(theme.spacing ?? 8) ?? '8px';
    const fontFamily =
      theme.tokens?.fontFamily ??
      'ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif';
    const preset = themePreset(theme.surfaceIntent);
    const weightDefaults = visualWeightDefaults(theme.visualWeight);
    const interaction = interactionDefaults(theme.interactionModel);

    let sampled: {
      background?: string | null;
      text?: string | null;
      accent?: string | null;
      border?: string | null;
      fontFamily?: string | null;
    } = {};
    if (theme.auto) {
      const auto = typeof theme.auto === 'object' ? theme.auto : {};
      const sampleSelector = auto.sampleSelector ?? target.selector ?? 'body';
      sampled = await page.evaluate(({sampleSelector}) => {
        const isTransparent = (value?: string | null) => {
          if (!value) {return true;}
          const normalized = value.trim().toLowerCase();
          if (!normalized || normalized === 'transparent') {return true;}
          const match = normalized.match(/rgba?\(([^)]+)\)/);
          if (!match) {return false;}
          const parts = match[1].split(',').map(part => part.trim());
          if (parts.length < 4) {return false;}
          return Number(parts[3]) === 0;
        };
        const pickStyles = (el: Element | null) => {
          if (!el) {return null;}
          const styles = window.getComputedStyle(el);
          return {
            background: styles.backgroundColor,
            color: styles.color,
            border: styles.borderColor,
            fontFamily: styles.fontFamily,
          };
        };
        const pickBackground = (el: Element | null) => {
          let current: Element | null = el;
          while (current) {
            const bg = window.getComputedStyle(current).backgroundColor;
            if (!isTransparent(bg)) {return bg;}
            current = current.parentElement;
          }
          return null;
        };
        const container = document.querySelector(sampleSelector);
        const sample = pickStyles(container);
        const background = pickBackground(container);
        const border = sample?.border && !isTransparent(sample.border) ? sample.border : null;
        const button =
          container?.querySelector('button, [role="button"], .btn') ??
          document.querySelector('button');
        const buttonStyles = pickStyles(button);
        const accentCandidate =
          buttonStyles?.background && !isTransparent(buttonStyles.background)
            ? buttonStyles.background
            : buttonStyles?.color;
        const accent = accentCandidate && !isTransparent(accentCandidate) ? accentCandidate : null;
        return {
          background,
          text: sample?.color,
          border,
          fontFamily: sample?.fontFamily,
          accent,
        };
      }, {sampleSelector});
    }

    const palette = {
      ...preset,
      ...(sampled.background ? {background: sampled.background} : {}),
      ...(sampled.text ? {text: sampled.text} : {}),
      ...(sampled.border ? {border: sampled.border} : {}),
      ...(sampled.accent ? {accent: sampled.accent} : {}),
      ...(theme.palette ?? {}),
    };

    const accentContrast = chooseContrastColor(palette.accent, palette.text ?? '#ffffff');
    const separatorOverride =
      theme.separatorStyle === 'none'
        ? 'transparent'
        : theme.separatorStyle === 'strong'
          ? palette.border
          : colorWithAlpha(palette.border, 0.5) ?? palette.border;
    const rootVars = [
      `--${prefix}-radius:${radius}px;`,
      `--${prefix}-gap:${spacing};`,
      `--${prefix}-font:${sampled.fontFamily ?? fontFamily};`,
      `--${prefix}-bg:${palette.background};`,
      `--${prefix}-surface:${palette.surface};`,
      `--${prefix}-accent:${palette.accent};`,
      `--${prefix}-text:${palette.text};`,
      `--${prefix}-border:${palette.border};`,
      `--${prefix}-muted:${palette.muted};`,
      `--${prefix}-shadow:${palette.shadow ?? weightDefaults.shadow};`,
      `--${prefix}-border-width:${weightDefaults.borderWidth};`,
      `--${prefix}-depth-1:${weightDefaults.depth1};`,
      `--${prefix}-depth-2:${weightDefaults.depth2};`,
      `--${prefix}-separator:${separatorOverride};`,
      `--${prefix}-control-size:${interaction.controlSize};`,
      `--${prefix}-control-padding:${interaction.controlPadding};`,
      `--${prefix}-accent-contrast:${accentContrast};`,
    ].join(' ');

    const baseCss = `
      .${prefix}-selected{outline:2px solid var(--${prefix}-accent);outline-offset:2px;}
      .${prefix}-root{color:var(--${prefix}-text);}
      .${prefix}-nested{display:contents;}
      .${prefix}-util-panel{background:var(--${prefix}-surface);border:var(--${prefix}-border-width,1px) solid var(--${prefix}-border);border-radius:var(--${prefix}-radius,6px);box-shadow:var(--${prefix}-shadow);padding:0.5rem;}
      .${prefix}-util-toolbar{display:flex;align-items:center;gap:0.5rem;}
      .${prefix}-util-toolbar-group{display:flex;align-items:center;gap:0.35rem;}
      .${prefix}-resize-handle{background:var(--${prefix}-border);opacity:0.7;}
      .${prefix}-util-depth-1{box-shadow:var(--${prefix}-depth-1);}
      .${prefix}-util-depth-2{box-shadow:var(--${prefix}-depth-2);}
      .${prefix}-util-separator{border-bottom:1px solid var(--${prefix}-separator);}
      .${prefix}-util-separator-vertical{border-right:1px solid var(--${prefix}-separator);}
    `;

    const scopedCss = `
      ${scopeSelector}{${rootVars}font-family:var(--${prefix}-font);height:100vh;display:flex;flex-direction:column;}
      ${scopeSelector}, ${scopeSelector} *{box-sizing:border-box;}
      ${scopeCss(layoutCss + baseCss, scopeSelector)}
    `;

    // Add root element to component map
    componentMap.unshift({
      elementName: 'root',
      id: rootId,
      classes: [`${prefix}-root`],
      cssVariables: extractCssVariables(scopedCss, `#${rootId}`, prefix),
      selector: `#${rootId}`,
    });

    const rootHtml = `
      <div id="${rootId}" class="${prefix}-root" ${PATCH_ID_ATTR}="${domPatchId}" ${PATCH_OWNER_ATTR}="${PATCH_OWNER_VALUE}" ${PATCH_KIND_ATTR}="dom-manipulation" data-le-root="true">
        ${layoutHtml}
      </div>
    `;

    // Component map output mode (summary vs full)
    const componentMapMode = (request.params as any).componentMapMode ?? 'full';
    const componentMapSummary = componentMapMode === 'summary';
    
    if (mode === 'export_only' || componentMapSummary) {
      // Add prominent Component Map summary for AI
      response.appendResponseLine('');
      response.appendResponseLine('# 📋 Component Map');
      response.appendResponseLine('');
      response.appendResponseLine(`**Created ${componentMap.length} key elements** with IDs, classes, and CSS variable dependencies.`);
      response.appendResponseLine('');
      
      // Summary section highlighting key elements
      response.appendResponseLine('## 🔑 Key Elements Summary');
      response.appendResponseLine('');
      
      const rootElementExport = componentMap.find(e => e.elementName === 'root');
      if (rootElementExport) {
        response.appendResponseLine(`- **Root Container**: \`${rootElementExport.id}\` (${rootElementExport.classes.join(', ')})`);
      }
      
      const viewerElementsExport = componentMap.filter(e => e.elementName.startsWith('viewer'));
      if (viewerElementsExport.length > 0) {
        response.appendResponseLine(`- **Viewer Components**: ${viewerElementsExport.length} elements (triggers, panels, controls)`);
      }
      
      const gridElementsExport = componentMap.filter(e => e.elementName.includes('grid'));
      if (gridElementsExport.length > 0) {
        response.appendResponseLine(`- **Grid Layout**: ${gridElementsExport.length} elements (rows, items, overlays)`);
      }
      
      const stackElementsExport = componentMap.filter(e => e.elementName.includes('stack'));
      if (stackElementsExport.length > 0) {
        response.appendResponseLine(`- **Stack Layout**: ${stackElementsExport.length} elements (container, items)`);
      }
      
      // Only show detailed listing if not in summary mode
      if (!componentMapSummary) {
        response.appendResponseLine('');
        
        // Detailed component listing
        response.appendResponseLine('## 📦 Component Details');
        response.appendResponseLine('');
        
        componentMap.forEach((entry, index) => {
          response.appendResponseLine(`### ${index + 1}. ${entry.elementName}`);
          if (entry.id) {
            response.appendResponseLine(`   - **ID**: \`${entry.id}\``);
          }
          if (entry.classes.length > 0) {
            response.appendResponseLine(`   - **Classes**: \`${entry.classes.join('`, `')}\``);
          }
          if (entry.selector) {
            response.appendResponseLine(`   - **Selector**: \`${entry.selector}\``);
          }
          if (entry.cssVariables.length > 0) {
            const varList = entry.cssVariables.map(v => `\`--${prefix}-${v}\``).join(', ');
            response.appendResponseLine(`   - **CSS Variables** (${entry.cssVariables.length}): ${varList}`);
          }
          if (index < componentMap.length - 1) {
            response.appendResponseLine('');
          }
        });
      }
      
      response.appendResponseLine('');
      
      // Usage examples
      response.appendResponseLine('## 💡 Usage Examples');
      response.appendResponseLine('');
      response.appendResponseLine('### Modifying Element Styles');
      response.appendResponseLine('```json');
      response.appendResponseLine('{');
      response.appendResponseLine('  "name": "insert_css",');
      response.appendResponseLine('  "params": {');
      if (rootElementExport) {
        response.appendResponseLine(`    "selector": "${rootElementExport.selector}",`);
        response.appendResponseLine(`    "cssText": ":root { --${prefix}-accent: #3b82f6; }"`);
      }
      response.appendResponseLine('  }');
      response.appendResponseLine('}');
      response.appendResponseLine('```');
      response.appendResponseLine('');
      
      const elementWithIdExport = componentMap.find(e => e.id);
      if (elementWithIdExport) {
        response.appendResponseLine('### Manipulating Specific Elements');
        response.appendResponseLine('```json');
        response.appendResponseLine('{');
        response.appendResponseLine('  "name": "manipulate_dom",');
        response.appendResponseLine('  "params": {');
        response.appendResponseLine('    "operations": [');
        response.appendResponseLine('      {');
        response.appendResponseLine(`        "action": "set-style",`);
        response.appendResponseLine(`        "selector": "${elementWithIdExport.selector}",`);
        response.appendResponseLine(`        "properties": { "padding": "1rem" }`);
        response.appendResponseLine('      }');
        response.appendResponseLine('    ]');
        response.appendResponseLine('  }');
        response.appendResponseLine('}');
        response.appendResponseLine('```');
        response.appendResponseLine('');
      }
      
      if (componentMap.some(e => e.cssVariables.length > 0)) {
        const varExampleExport = componentMap.find(e => e.cssVariables.length > 0);
        if (varExampleExport) {
          response.appendResponseLine('### Customizing CSS Variables');
          response.appendResponseLine('```json');
          response.appendResponseLine('{');
          response.appendResponseLine('  "name": "insert_css",');
          response.appendResponseLine('  "params": {');
          response.appendResponseLine(`    "selector": "${scopeSelector}",`);
          response.appendResponseLine(`    "cssText": "${scopeSelector} { --${prefix}-${varExampleExport.cssVariables[0]}: new-value; }"`);
          response.appendResponseLine('  }');
          response.appendResponseLine('}');
          response.appendResponseLine('```');
          response.appendResponseLine('');
        }
      }
      
      response.appendResponseLine('### Querying/Inspecting Existing CSS');
      response.appendResponseLine('To inspect existing CSS before updating, use `evaluate_script`:');
      response.appendResponseLine('```json');
      response.appendResponseLine('{');
      response.appendResponseLine('  "name": "evaluate_script",');
      response.appendResponseLine('  "params": {');
      response.appendResponseLine(`    "script": "const style = document.querySelector('style[data-mcp-patch-id=\\'${cssPatchId}\\']'); return style ? style.textContent : null;"`);
      response.appendResponseLine('  }');
      response.appendResponseLine('}');
      response.appendResponseLine('```');
      response.appendResponseLine('');
      response.appendResponseLine('### Safe CSS Updates with Merge/Append');
      response.appendResponseLine('Use `cssMode` to safely update CSS without losing existing styles:');
      response.appendResponseLine('```json');
      response.appendResponseLine('{');
      response.appendResponseLine('  "name": "layout_live_editing",');
      response.appendResponseLine('  "params": {');
      response.appendResponseLine('    "patch": {');
      response.appendResponseLine('      "cssMode": "merge",  // or "append" or "replace" (default)');
      response.appendResponseLine(`      "patchIdPrefix": "${patchIdPrefix}"`);
      response.appendResponseLine('    },');
      response.appendResponseLine('    "composition": { ... }');
      response.appendResponseLine('  }');
      response.appendResponseLine('}');
      response.appendResponseLine('```');
      response.appendResponseLine('');
      response.appendResponseLine('- **`merge`**: Merges new CSS with existing, updating conflicting rules');
      response.appendResponseLine('- **`append`**: Appends new CSS without removing existing styles');
      response.appendResponseLine('- **`replace`**: Replaces entire CSS block (default, use with caution)');
      response.appendResponseLine('');
      
      response.appendResponseLine('---');
      response.appendResponseLine('');
      response.appendResponseLine('```json');
      response.appendResponseLine(
        JSON.stringify(
          {
            mode,
            pageId,
            patchIds: {dom: domPatchId, css: cssPatchId, js: jsPatchId},
            html: rootHtml.trim(),
            css: scopedCss.trim(),
            js: behaviorScript.trim(),
            behaviors: combinedBehaviors.map(b => b.type),
            componentMap: componentMap.map(entry => ({
              elementName: entry.elementName,
              id: entry.id,
              classes: entry.classes,
              cssVariables: entry.cssVariables,
              selector: entry.selector,
            })),
          },
          null,
          2,
        ),
      );
      response.appendResponseLine('```');
      return;
    }

    // Parse selector for array index notation support
    const selectorInfo = parseSelectorWithIndex(target.selector ?? 'body');
    
    const domResult = await page.evaluate(
      ({baseSelector, index, position, html, patchId, replaceExisting, PATCH_ID_ATTR}) => {
        // Support array index notation: find all matches and select by index
        let target: Element | null;
        if (index !== undefined) {
          const allMatches = Array.from(document.querySelectorAll(baseSelector));
          if (index < 0 || index >= allMatches.length) {
            return {
              success: false,
              reason: 'target_not_found',
              selector: `${baseSelector}[${index}]`,
              message: `Index ${index} out of range. Found ${allMatches.length} matching element(s).`,
            };
          }
          target = allMatches[index];
        } else {
          target = document.querySelector(baseSelector);
        }
        
        if (!target) {
          return {success: false, reason: 'target_not_found', selector: baseSelector};
        }
        if (!position) {
          position = 'beforeend';
        }
        const existing = document.querySelector(`[${PATCH_ID_ATTR}="${patchId}"]`);
        if (existing) {
          if (!replaceExisting) {
            return {success: false, reason: 'patch_exists', patchId};
          }
          existing.outerHTML = html;
          return {success: true, selector: baseSelector, replaced: true};
        }
        if (document.querySelector(`[${PATCH_ID_ATTR}="${patchId}"]`)) {
          return {success: false, reason: 'patch_exists', patchId};
        }
        target.insertAdjacentHTML(position, html);
        return {success: true, selector: baseSelector};
      },
      {
        baseSelector: selectorInfo.baseSelector,
        index: selectorInfo.index,
        position: target.position ?? 'beforeend',
        html: rootHtml,
        patchId: domPatchId,
        replaceExisting,
        PATCH_ID_ATTR,
      },
    );

    if (!domResult.success && domResult.reason === 'patch_exists' && !replaceExisting) {
      // Get information about the existing patch for better messaging
      const existingPatch = context.getPatch(domPatchId);
      const patchInfo = existingPatch
        ? ` (created ${new Date(existingPatch.createdAt).toLocaleString()}${existingPatch.description ? `: ${existingPatch.description}` : ''})`
        : '';
      response.appendResponseLine(
        `⚠️ **DOM patch skipped**: Patch \`${domPatchId}\` already exists${patchInfo}.`,
      );
      response.appendResponseLine(
        `💡 **Options**:`,
      );
      response.appendResponseLine(
        `   - Use \`patch: { replaceExisting: true }\` to overwrite the existing patch`,
      );
      response.appendResponseLine(
        `   - Use a different \`patchIdPrefix\` to create a new patch`,
      );
      response.appendResponseLine(
        `   - The existing patch will remain unchanged and the operation was skipped`,
      );
    } else if (!domResult.success) {
      const errorMessage = (domResult as any).message 
        ? `${domResult.reason ?? 'unknown error'}: ${(domResult as any).message}`
        : domResult.reason ?? 'unknown error';
      throw new Error(`Failed to insert DOM: ${errorMessage}`);
    } else {
      context.registerPatch({
        patchId: domPatchId,
        patchType: 'dom-manipulation',
        pageId,
        createdAt: Date.now(),
        description: 'layout_live_editing DOM root',
      });
      if (recordToSession) {
        context.appendEditChange(
          {
            type: 'manipulate_dom',
            pageId,
            createdAt: Date.now(),
            patchId: domPatchId,
            description: 'layout_live_editing DOM root',
            targetFilePath: patch.targetFilePaths?.html,
            payload: {
              action: 'insert-html',
              selector: target.selector ?? 'body',
              position: target.position ?? 'beforeend',
              html: rootHtml,
            },
          },
          {sessionId: editSessionId, autoCreate: true},
        );
      }
    }

    // Perform content migration if needed (for selectable_view recipe with selector-based contents)
    if (contentMigration && contentMigration.length > 0 && resolvedComposition?.type === 'component_parametric_viewer') {
      // Parse target selector for array index notation support
      const targetSelectorInfo = parseSelectorWithIndex(target.selector ?? 'body');
      
      // Pre-validate migrations before executing
      const preValidation = await page.evaluate(
        ({rootId, prefix, migrations, baseSelector, index}) => {
          const root = document.getElementById(rootId);
          
          // Support array index notation for target selector
          let target: Element | null;
          if (index !== undefined) {
            const allMatches = Array.from(document.querySelectorAll(baseSelector));
            if (index < 0 || index >= allMatches.length) {
              return {
                valid: false,
                errors: [`Target selector "${baseSelector}[${index}]" index out of range. Found ${allMatches.length} matching element(s).`],
                warnings: [],
              };
            }
            target = allMatches[index];
          } else {
            target = document.querySelector(baseSelector);
          }
          
          const warnings: string[] = [];
          const errors: string[] = [];

          // Check if root exists
          if (!root) {
            errors.push(`Layout root element with id "${rootId}" not found.`);
            return {valid: false, errors, warnings: []};
          }

          // Check if target exists
          if (!target) {
            errors.push(`Target element "${baseSelector}${index !== undefined ? `[${index}]` : ''}" not found.`);
            return {valid: false, errors, warnings: []};
          }

          // Validate each migration
          for (const migration of migrations) {
            const {panelIndex, selector} = migration;
            const panelId = `${prefix}-panel-${panelIndex}`;
            
            // Check if panel will exist (it should, but validate)
            // Note: panel doesn't exist yet, but we can check the structure
            
            // Check if source element exists
            const sourceElement = document.querySelector(selector);
            if (!sourceElement) {
              errors.push(`Source element for panel ${panelIndex} not found: "${selector}"`);
              continue;
            }

            // Check if source is the root itself (would cause issues)
            if (sourceElement === root) {
              errors.push(`Selector "${selector}" matches the layout root element. Cannot migrate root into itself.`);
              continue;
            }

            // Check if source is the target (would cause issues)
            if (sourceElement === target) {
              warnings.push(`Selector "${selector}" matches the target element. This may cause the layout to be inserted inside itself.`);
            }

            // Check if source is already inside the root (potential duplication)
            if (root.contains(sourceElement) && sourceElement !== root) {
              warnings.push(`Selector "${selector}" matches an element already inside the layout root. This will cause duplication. Consider using a different selector or hiding the original.`);
            }

            // Check for multiple matches (ambiguous selector)
            const allMatches = document.querySelectorAll(selector);
            if (allMatches.length > 1) {
              warnings.push(`Selector "${selector}" matches ${allMatches.length} elements. Only the first match will be migrated. Consider using a more specific selector.`);
            }
          }

          return {
            valid: errors.length === 0,
            errors,
            warnings,
          };
        },
        {
          rootId,
          prefix,
          migrations: contentMigration,
          baseSelector: targetSelectorInfo.baseSelector,
          index: targetSelectorInfo.index,
        },
      );

      // Report pre-validation results
      if (!preValidation.valid) {
        response.appendResponseLine('');
        response.appendResponseLine('❌ **Content Migration Validation Failed**');
        preValidation.errors.forEach(error => {
          response.appendResponseLine(`   - ${error}`);
        });
        if (preValidation.warnings.length > 0) {
          response.appendResponseLine('');
          response.appendResponseLine('⚠️ **Warnings**:');
          preValidation.warnings.forEach(warning => {
            response.appendResponseLine(`   - ${warning}`);
          });
        }
        response.appendResponseLine('');
        throw new Error('Content migration validation failed. Please fix the errors above.');
      }

      if (preValidation.warnings.length > 0) {
        response.appendResponseLine('');
        response.appendResponseLine('⚠️ **Pre-Migration Warnings**:');
        preValidation.warnings.forEach(warning => {
          response.appendResponseLine(`   - ${warning}`);
        });
        response.appendResponseLine('');
      }

      // Execute migrations
      const migrationResults = await page.evaluate(
        ({rootId, prefix, migrations}) => {
          const root = document.getElementById(rootId);
          if (!root) {
            return {success: false, reason: 'root_not_found', rootId};
          }

          const results: Array<{success: boolean; panelIndex: number; selector: string; reason?: string; warnings?: string[]}> = [];
          const warnings: string[] = [];

          for (const migration of migrations) {
            const {panelIndex, selector, preserveEvents, hideOriginal} = migration;
            const panelId = `${prefix}-panel-${panelIndex}`;
            const panel = document.getElementById(panelId);
            
            if (!panel) {
              results.push({
                success: false,
                panelIndex,
                selector,
                reason: 'panel_not_found',
              });
              continue;
            }

            // Find the source element
            const sourceElement = document.querySelector(selector);
            if (!sourceElement) {
              results.push({
                success: false,
                panelIndex,
                selector,
                reason: 'source_not_found',
              });
              continue;
            }

            // Check if source is already inside the root (potential duplication)
            if (root.contains(sourceElement) && sourceElement !== root) {
              warnings.push(`Selector "${selector}" matches an element already inside the layout root. This may cause duplication.`);
            }

            // Check if source is a descendant of another panel (potential nesting issue)
            const otherPanels = Array.from(root.querySelectorAll(`[id^="${prefix}-panel-"]`));
            for (const otherPanel of otherPanels) {
              if (otherPanel !== panel && otherPanel.contains(sourceElement)) {
                warnings.push(`Selector "${selector}" matches an element inside another panel (${otherPanel.id}). This may cause unexpected nesting.`);
              }
            }

            // Clone or move the element
            let movedElement: Element;
            if (preserveEvents) {
              // Clone to preserve original (and its event listeners)
              movedElement = sourceElement.cloneNode(true) as Element;
              // Copy all attributes
              Array.from(sourceElement.attributes).forEach(attr => {
                movedElement.setAttribute(attr.name, attr.value);
              });
            } else {
              // Move directly
              movedElement = sourceElement;
            }

            // Clear panel placeholder content if it exists
            panel.innerHTML = '';
            
            // Move/clone into panel
            panel.appendChild(movedElement);

            // Hide original if requested and we cloned
            if (hideOriginal && preserveEvents) {
              (sourceElement as HTMLElement).style.display = 'none';
            } else if (hideOriginal && !preserveEvents) {
              // If we moved (not cloned), the element is already in the panel, so we can't hide it
              warnings.push(`Cannot hide original element for "${selector}" because it was moved (not cloned). Set preserveEvents: true to hide the original.`);
            }

            results.push({
              success: true,
              panelIndex,
              selector,
            });
          }

          return {
            success: true,
            results,
            warnings: warnings.length > 0 ? warnings : undefined,
          };
        },
        {
          rootId,
          prefix,
          migrations: contentMigration,
        },
      );

      if (migrationResults.success && migrationResults.results) {
        // Report successful migrations
        const successful = migrationResults.results.filter(r => r.success);
        const failed = migrationResults.results.filter(r => !r.success);
        
        if (successful.length > 0) {
          response.appendResponseLine('');
          response.appendResponseLine(`✅ **Content Migration**: Successfully migrated ${successful.length} element(s) into tab panels`);
          successful.forEach(result => {
            response.appendResponseLine(`   - Panel ${result.panelIndex}: \`${result.selector}\``);
          });
        }

        if (failed.length > 0) {
          response.appendResponseLine('');
          response.appendResponseLine(`⚠️ **Migration Warnings**: ${failed.length} element(s) could not be migrated`);
          failed.forEach(result => {
            const reasonMsg = result.reason === 'panel_not_found' 
              ? 'Target panel not found'
              : result.reason === 'source_not_found'
              ? 'Source element not found'
              : 'Unknown error';
            response.appendResponseLine(`   - Panel ${result.panelIndex}: \`${result.selector}\` - ${reasonMsg}`);
          });
        }

        if (migrationResults.warnings && migrationResults.warnings.length > 0) {
          response.appendResponseLine('');
          response.appendResponseLine('⚠️ **Migration Warnings**:');
          migrationResults.warnings.forEach(warning => {
            response.appendResponseLine(`   - ${warning}`);
          });
        }

        response.appendResponseLine('');
      } else {
        response.appendResponseLine('');
        response.appendResponseLine(`⚠️ **Content Migration Failed**: ${migrationResults.reason ?? 'unknown error'}`);
        response.appendResponseLine('');
      }
    }

    // Validate CSS replacement and generate warnings
    let existingCss: string | null = null;
    if (cssMode === 'replace' || cssMode === 'merge') {
      existingCss = await page.evaluate(
        ({patchId, PATCH_ID_ATTR}) => {
          const existing = Array.from(
            document.querySelectorAll(`style[${PATCH_ID_ATTR}]`),
          ).find(el => el.getAttribute(PATCH_ID_ATTR) === patchId) as HTMLStyleElement | undefined;
          return existing?.textContent ?? null;
        },
        {patchId: cssPatchId, PATCH_ID_ATTR},
      );
    }
    
    const validation = validateCssReplacement(existingCss, scopedCss, cssMode);
    if (validation.shouldWarn) {
      response.appendResponseLine('');
      response.appendResponseLine('⚠️ **CSS Replacement Warning**');
      validation.warnings.forEach(warning => {
        response.appendResponseLine(`- ${warning}`);
      });
      if (cssMode === 'replace') {
        response.appendResponseLine('');
        response.appendResponseLine('💡 **Tip**: Consider using `cssMode: "merge"` to preserve existing styles, or `cssMode: "append"` to add new styles without removing existing ones.');
      }
      response.appendResponseLine('');
    }
    
    // Prepare final CSS based on mode
    let finalCss = scopedCss;
    if (existingCss && cssMode === 'merge') {
      finalCss = mergeCss(existingCss, scopedCss);
    } else if (existingCss && cssMode === 'append') {
      finalCss = appendCss(existingCss, scopedCss);
    }
    
    const cssApply = await page.evaluate(
      ({cssText, patchId, cssMode, replaceExisting, PATCH_ID_ATTR, PATCH_OWNER_ATTR, PATCH_KIND_ATTR, PATCH_OWNER_VALUE}) => {
        const existing = Array.from(
          document.querySelectorAll(`style[${PATCH_ID_ATTR}]`),
        ).find(el => el.getAttribute(PATCH_ID_ATTR) === patchId) as HTMLStyleElement | undefined;
        
        if (existing && !replaceExisting && cssMode === 'replace') {
          return {applied: false, reason: 'patch_exists'};
        }
        
        if (existing) {
          existing.textContent = cssText;
          return {applied: true, replaced: true, mode: cssMode};
        }
        
        const style = document.createElement('style');
        style.setAttribute(PATCH_ID_ATTR, patchId);
        style.setAttribute(PATCH_OWNER_ATTR, PATCH_OWNER_VALUE);
        style.setAttribute(PATCH_KIND_ATTR, 'css');
        style.textContent = cssText;
        document.head.appendChild(style);
        return {applied: true, mode: cssMode};
      },
      {
        cssText: finalCss,
        patchId: cssPatchId,
        cssMode,
        replaceExisting: replaceExisting || cssMode === 'replace',
        PATCH_ID_ATTR,
        PATCH_OWNER_ATTR,
        PATCH_KIND_ATTR,
        PATCH_OWNER_VALUE,
      },
    );

    if (cssApply.applied) {
      context.registerPatch({
        patchId: cssPatchId,
        patchType: 'css',
        pageId,
        createdAt: Date.now(),
        description: 'layout_live_editing CSS',
      });
      
      // Add informative response about CSS operation
      if (cssApply.replaced) {
        response.appendResponseLine('');
        response.appendResponseLine(`✅ **CSS Updated** (mode: \`${cssMode}\`)`);
        if (cssMode === 'merge') {
          response.appendResponseLine(`- Merged new CSS rules with existing styles`);
          response.appendResponseLine(`- Conflicting rules were updated with new values`);
        } else if (cssMode === 'append') {
          response.appendResponseLine(`- Appended new CSS rules to existing styles`);
        } else {
          response.appendResponseLine(`- Replaced existing CSS with new styles`);
        }
        response.appendResponseLine('');
      }
      
      if (recordToSession) {
        context.appendEditChange(
          {
            type: 'insert_css',
            pageId,
            createdAt: Date.now(),
            patchId: cssPatchId,
            description: 'layout_live_editing CSS',
            targetFilePath: patch.targetFilePaths?.css,
            payload: {
              cssText: finalCss,
              patchId: cssPatchId,
              replaceExisting: replaceExisting || cssMode === 'replace',
              cssMode,
            },
          },
          {sessionId: editSessionId, autoCreate: true},
        );
      }
    } else if (cssApply.reason === 'patch_exists') {
      response.appendResponseLine('');
      response.appendResponseLine(`⚠️ **CSS Patch Exists**: Patch \`${cssPatchId}\` already exists.`);
      response.appendResponseLine(`💡 **Tip**: Use \`replaceExisting: true\` to overwrite, or \`cssMode: "merge"\` / \`cssMode: "append"\` to update existing styles.`);
      response.appendResponseLine('');
      response.appendResponseLine('**To inspect existing CSS**, you can use:');
      response.appendResponseLine('```javascript');
      response.appendResponseLine(`const style = document.querySelector('style[data-mcp-patch-id="${cssPatchId}"]');`);
      response.appendResponseLine('console.log(style?.textContent);');
      response.appendResponseLine('```');
      response.appendResponseLine('');
    }

    if (behaviorScript.trim()) {
      const jsApply = await page.evaluate(
        ({jsText, patchId, replaceExisting, PATCH_ID_ATTR, PATCH_OWNER_ATTR, PATCH_KIND_ATTR, PATCH_OWNER_VALUE}) => {
          const existing = Array.from(
            document.querySelectorAll(`script[${PATCH_ID_ATTR}]`),
          ).find(el => el.getAttribute(PATCH_ID_ATTR) === patchId) as HTMLScriptElement | undefined;
          if (existing && !replaceExisting) {
            return {applied: false, reason: 'patch_exists'};
          }
          if (existing) {
            existing.remove();
          }
          const script = document.createElement('script');
          script.setAttribute(PATCH_ID_ATTR, patchId);
          script.setAttribute(PATCH_OWNER_ATTR, PATCH_OWNER_VALUE);
          script.setAttribute(PATCH_KIND_ATTR, 'js');
          script.textContent = jsText;
          document.body.appendChild(script);
          return {applied: true};
        },
        {
          jsText: behaviorScript,
          patchId: jsPatchId,
          replaceExisting,
          PATCH_ID_ATTR,
          PATCH_OWNER_ATTR,
          PATCH_KIND_ATTR,
          PATCH_OWNER_VALUE,
        },
      );

      if (jsApply.applied) {
        context.registerPatch({
          patchId: jsPatchId,
          patchType: 'js',
          pageId,
          createdAt: Date.now(),
          description: 'layout_live_editing JS',
        });
        if (recordToSession) {
          context.appendEditChange(
            {
              type: 'insert_js',
              pageId,
              createdAt: Date.now(),
              patchId: jsPatchId,
              description: 'layout_live_editing JS',
              targetFilePath: patch.targetFilePaths?.js,
              payload: {
                jsText: behaviorScript,
                patchId: jsPatchId,
                replaceExisting,
              },
            },
            {sessionId: editSessionId, autoCreate: true},
          );
        }
      }
    } else if (replaceExisting) {
      await rollbackPatch.handler({params: {patchId: jsPatchId}}, response, context);
    }

    // Validate grid layout for overlapping items (if this is a grid layout)
    if (resolvedComposition?.type === 'layout_parametric_grid' && mode === 'apply') {
      try {
        const {captureWireframeSnapshot} = await import('./wireframe.js');
        const {output} = await captureWireframeSnapshot(
          {
            params: {
              scopeSelector: `#${rootId}`,
              includeDescendants: true,
              includeComputedStyles: true,
              computedStylePreset: 'layout',
              includeOverlapAnalysis: true,
              analysisMaxPairs: 1000,
              analysisMaxFindings: 20,
              analysisMinOverlapArea: 4,
            },
          },
          context,
        );

        if (output.analysis?.overlaps && output.analysis.overlaps.length > 0) {
          response.appendResponseLine('');
          response.appendResponseLine('⚠️ **Grid Layout Validation: Overlapping Items Detected**');
          response.appendResponseLine('');
          response.appendResponseLine(`Found ${output.analysis.overlaps.length} overlapping element pair(s) in the grid layout.`);
          response.appendResponseLine('');
          response.appendResponseLine('**Top overlapping pairs:**');
          const topOverlaps = output.analysis.overlaps.slice(0, 5);
          topOverlaps.forEach((overlap, idx) => {
            response.appendResponseLine(`${idx + 1}. Elements \`${overlap.a}\` and \`${overlap.b}\` overlap by ${Math.round(overlap.area)}px²`);
            response.appendResponseLine(`   - Overlap ratio: ${Math.round(overlap.overlapRatioA * 100)}% of element A, ${Math.round(overlap.overlapRatioB * 100)}% of element B`);
          });
          if (output.analysis.overlaps.length > 5) {
            response.appendResponseLine(`   ... and ${output.analysis.overlaps.length - 5} more overlapping pair(s)`);
          }
          response.appendResponseLine('');
          response.appendResponseLine('**Possible causes:**');
          response.appendResponseLine('- Grid rows may not have `display: grid` applied correctly');
          response.appendResponseLine('- Grid column template may not match the number of items');
          response.appendResponseLine('- CSS specificity issues preventing grid styles from applying');
          response.appendResponseLine('- Items may have explicit positioning (absolute/fixed)');
          response.appendResponseLine('');
          response.appendResponseLine('**Suggested fixes:**');
          response.appendResponseLine(`1. Verify grid rows have \`display: grid\` applied (check \`.${prefix}-grid-row\` styles)`);
          response.appendResponseLine('2. Ensure grid-template-columns matches the number of items per row');
          response.appendResponseLine('3. Check for CSS conflicts using browser DevTools');
          response.appendResponseLine('4. Use `insert_css` to add explicit grid styles if needed:');
          response.appendResponseLine('```css');
          response.appendResponseLine(`.${prefix}-grid-row {`);
          response.appendResponseLine('  display: grid !important;');
          response.appendResponseLine('  grid-template-columns: repeat(4, 1fr) !important;');
          response.appendResponseLine('  gap: 24px !important;');
          response.appendResponseLine('}');
          response.appendResponseLine('```');
          response.appendResponseLine('');
        } else {
          response.appendResponseLine('');
          response.appendResponseLine('✅ **Grid Layout Validation: No overlapping items detected**');
          response.appendResponseLine('');
        }
      } catch (error) {
        // Don't fail the operation if validation fails, just log a warning
        response.appendResponseLine('');
        response.appendResponseLine(`⚠️ **Grid Layout Validation**: Could not validate layout (${error instanceof Error ? error.message : String(error)})`);
        response.appendResponseLine('');
      }
    }

    if (request.params.verify?.wireframeSnapshot) {
      await wireframeSnapshotLiveEditing.handler({
        params: {
          maxTotal: undefined, // Unlimited for complete verification
        }
      }, response, context);
    }
    // Default to true if not explicitly set to false
    // If verify is not provided at all, or svgSnapshot is not explicitly false, capture snapshot
    const shouldCaptureSvg = request.params.verify === undefined || 
                             request.params.verify.svgSnapshot !== false;
    if (shouldCaptureSvg) {
      await svgSnapshotLiveEditing.handler({
        params: {
          maxTotal: undefined, // Unlimited for complete verification
        }
      }, response, context);
    }

    if (mode === 'preview') {
      await rollbackPatch.handler({params: {patchId: domPatchId}}, response, context);
      await rollbackPatch.handler({params: {patchId: cssPatchId}}, response, context);
      if (behaviorScript.trim()) {
        await rollbackPatch.handler({params: {patchId: jsPatchId}}, response, context);
      }
    }

    // Add prominent Component Map summary for AI
    response.appendResponseLine('');
    response.appendResponseLine('# 📋 Component Map');
    response.appendResponseLine('');
    response.appendResponseLine(`**Created ${componentMap.length} key elements** with IDs, classes, and CSS variable dependencies.`);
    response.appendResponseLine('');
    
    // Summary section highlighting key elements
    response.appendResponseLine('## 🔑 Key Elements Summary');
    response.appendResponseLine('');
    
    const rootElement = componentMap.find(e => e.elementName === 'root');
    if (rootElement) {
      response.appendResponseLine(`- **Root Container**: \`${rootElement.id}\` (${rootElement.classes.join(', ')})`);
    }
    
    const viewerElements = componentMap.filter(e => e.elementName.startsWith('viewer'));
    if (viewerElements.length > 0) {
      response.appendResponseLine(`- **Viewer Components**: ${viewerElements.length} elements (triggers, panels, controls)`);
    }
    
    const gridElements = componentMap.filter(e => e.elementName.includes('grid'));
    if (gridElements.length > 0) {
      response.appendResponseLine(`- **Grid Layout**: ${gridElements.length} elements (rows, items, overlays)`);
    }
    
    const stackElements = componentMap.filter(e => e.elementName.includes('stack'));
    if (stackElements.length > 0) {
      response.appendResponseLine(`- **Stack Layout**: ${stackElements.length} elements (container, items)`);
    }
    
    response.appendResponseLine('');
    
    // Detailed component listing
    response.appendResponseLine('## 📦 Component Details');
    response.appendResponseLine('');
    
    componentMap.forEach((entry, index) => {
      response.appendResponseLine(`### ${index + 1}. ${entry.elementName}`);
      if (entry.id) {
        response.appendResponseLine(`   - **ID**: \`${entry.id}\``);
      }
      if (entry.classes.length > 0) {
        response.appendResponseLine(`   - **Classes**: \`${entry.classes.join('`, `')}\``);
      }
      if (entry.selector) {
        response.appendResponseLine(`   - **Selector**: \`${entry.selector}\``);
      }
      if (entry.cssVariables.length > 0) {
        const varList = entry.cssVariables.map(v => `\`--${prefix}-${v}\``).join(', ');
        response.appendResponseLine(`   - **CSS Variables** (${entry.cssVariables.length}): ${varList}`);
      }
      if (index < componentMap.length - 1) {
        response.appendResponseLine('');
      }
    });
    
    response.appendResponseLine('');
    
    // Usage examples
    response.appendResponseLine('## 💡 Usage Examples');
    response.appendResponseLine('');
    response.appendResponseLine('### Modifying Element Styles');
    response.appendResponseLine('```json');
    response.appendResponseLine('{');
    response.appendResponseLine('  "name": "insert_css",');
    response.appendResponseLine('  "params": {');
    if (rootElement) {
      response.appendResponseLine(`    "selector": "${rootElement.selector}",`);
      response.appendResponseLine(`    "cssText": ":root { --${prefix}-accent: #3b82f6; }"`);
    }
    response.appendResponseLine('  }');
    response.appendResponseLine('}');
    response.appendResponseLine('```');
    response.appendResponseLine('');
    
    const elementWithId = componentMap.find(e => e.id);
    if (elementWithId) {
      response.appendResponseLine('### Manipulating Specific Elements');
      response.appendResponseLine('```json');
      response.appendResponseLine('{');
      response.appendResponseLine('  "name": "manipulate_dom",');
      response.appendResponseLine('  "params": {');
      response.appendResponseLine('    "operations": [');
      response.appendResponseLine('      {');
      response.appendResponseLine(`        "action": "set-style",`);
      response.appendResponseLine(`        "selector": "${elementWithId.selector}",`);
      response.appendResponseLine(`        "properties": { "padding": "1rem" }`);
      response.appendResponseLine('      }');
      response.appendResponseLine('    ]');
      response.appendResponseLine('  }');
      response.appendResponseLine('}');
      response.appendResponseLine('```');
      response.appendResponseLine('');
    }
    
    if (componentMap.some(e => e.cssVariables.length > 0)) {
      const varExample = componentMap.find(e => e.cssVariables.length > 0);
      if (varExample) {
        response.appendResponseLine('### Customizing CSS Variables');
        response.appendResponseLine('```json');
        response.appendResponseLine('{');
        response.appendResponseLine('  "name": "insert_css",');
        response.appendResponseLine('  "params": {');
        response.appendResponseLine(`    "selector": "${scopeSelector}",`);
        response.appendResponseLine(`    "cssText": "${scopeSelector} { --${prefix}-${varExample.cssVariables[0]}: new-value; }"`);
        response.appendResponseLine('  }');
        response.appendResponseLine('}');
        response.appendResponseLine('```');
        response.appendResponseLine('');
      }
    }
    
    response.appendResponseLine('---');
    response.appendResponseLine('');
    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          mode,
          pageId,
          patchIds: {dom: domPatchId, css: cssPatchId, js: jsPatchId},
          target,
          root: {id: rootId, classPrefix: prefix, scopeSelector},
          behaviors: combinedBehaviors.map(b => b.type),
          componentMap: componentMap.map(entry => ({
            elementName: entry.elementName,
            id: entry.id,
            classes: entry.classes,
            cssVariables: entry.cssVariables,
            selector: entry.selector,
          })),
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

