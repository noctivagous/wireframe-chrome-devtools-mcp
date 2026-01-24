/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool, type Context, type Response} from './ToolDefinition.js';
import {rollbackPatch} from './mutation.js';
import {svgSnapshotLiveEditing, wireframeSnapshotLiveEditing} from './wireframe.js';

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

const lengthSchema = zod
  .union([zod.number(), zod.string()])
  .describe('CSS length (number interpreted as px) or token string (e.g., "1fr", "0.5rem").');

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
    composition: zod
      .lazy(() => compositionSchema)
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

const offsetVectorSchema = zod.object({
  x: lengthSchema.optional().describe('Horizontal offset.'),
  y: lengthSchema.optional().describe('Vertical offset.'),
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

const layoutParametricGridSchema: zod.ZodTypeAny = zod.object({
  rows: zod.array(gridRowSchema).min(1).describe('Grid rows definition.'),
  columnCount: zod
    .number()
    .int()
    .positive()
    .optional()
    .describe('Explicit column count for all rows (prevents implicit wrapping).'),
  unit: lengthSchema.optional().describe('Base unit size (e.g., "1fr").'),
  gap: lengthSchema.optional().describe('Default gap within each row.'),
  rowGap: lengthSchema.optional().describe('Gap between rows.'),
  rowHeight: lengthSchema.optional().describe('Fixed row height for all rows.'),
  rowMinHeight: lengthSchema.optional().describe('Minimum row height for all rows.'),
  rowLayout: zod
    .enum(['grid', 'flex'])
    .optional()
    .describe('Row layout mode ("grid" for CSS grid, "flex" for flex row).'),
  overlay: zod
    .array(gridOverlayLayerSchema)
    .optional()
    .describe('Optional overlay layers (e.g., piano black keys).'),
});

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
              composition: zod.lazy(() => compositionSchema),
            }),
          ])
          .describe('HTML content or nested composition for the panel/view.'),
      }),
    )
    .min(1)
    .describe('Selectable items rendered by the component.'),
});

compositionSchema = zod.discriminatedUnion('type', [
  zod.object({
    type: zod.literal('layout_parametric_grid'),
    params: layoutParametricGridSchema,
    behaviors: zod.array(behaviorSchema).optional(),
  }),
  zod.object({
    type: zod.literal('layout_parametric_stack'),
    params: layoutParametricStackSchema,
    behaviors: zod.array(behaviorSchema).optional(),
  }),
  zod.object({
    type: zod.literal('component_parametric_viewer'),
    params: componentParametricViewerSchema,
    behaviors: zod.array(behaviorSchema).optional(),
  }),
]);

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

const targetSchema = zod.object({
  selector: zod.string().describe('CSS selector to insert into (default: body).'),
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
    .optional()
    .describe('If true, capture an SVG wireframe snapshot after applying.'),
});

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

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

function normalizeLength(value: number | string | undefined): string | undefined {
  if (value === undefined) {return undefined;}
  return typeof value === 'number' ? `${value}px` : value;
}

function parseUnitOffset(offset: number | string | undefined): number | null {
  if (offset === undefined) {return null;}
  if (typeof offset === 'number') {return offset;}
  const trimmed = offset.trim();
  if (trimmed.endsWith('u')) {
    const parsed = Number(trimmed.slice(0, -1));
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

function buildInlineStyle(style?: Record<string, string>): string {
  if (!style) {return '';}
  const entries = Object.entries(style)
    .map(([key, value]) => `${key}:${value}`)
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
  const rowGap = normalizeLength(row.gap ?? defaultGap);
  const totalUnits =
    spans.reduce((acc: number, span: number) => acc + (Number.isFinite(span) ? span : 1), 0) +
    (offsetUnits ? Math.ceil(offsetUnits) : 0);

  const rowStyles: string[] = [];
  const nestedCss: string[] = [];
  const nestedBehaviors: BehaviorSpec[] = [];
  if (rowGap) {rowStyles.push(`gap: ${rowGap};`);}
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
    offset.translateX ? `translateX(${offset.translateX})` : '',
    offset.translateY ? `translateY(${offset.translateY})` : '',
  ].filter(Boolean);
  const overlayStyles = [`z-index:${zIndex};`];
  if (transformParts.length) {
    overlayStyles.push(`transform:${transformParts.join(' ')};`);
  }
  let html = `<div class="${prefix}-grid-overlay" data-le-overlay="${layerIndex}" style="${overlayStyles.join('')}">`;
  if (offsetUnits && offsetUnits > 0) {
    const spanValue = Math.max(1, Math.ceil(offsetUnits));
    html += `<div class="${prefix}-grid-spacer" style="grid-column: span ${spanValue};"></div>`;
  }

  layer.items.forEach((item: ContentItem, itemIndex: number) => {
    const rendered = renderContentItem(item, prefix, componentMap);
    const resolved = rendered.resolved;
    const span = spans[itemIndex] ?? 1;
    const style = resolved.style ?? {};
    const spanStyle = span > 1 ? `grid-column: span ${span};` : '';
    const inlineStyle = spanStyle ? ` style="${spanStyle}${Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';')}"` : buildInlineStyle(style);
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
  const baseGap = normalizeLength(params.gap);
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
      buildGridRowHtml(row, prefix, index, unit, baseGap, {
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
  if (params.overlay && params.overlay.length > 0) {
    params.overlay.forEach((layer: GridOverlayLayer, index: number) => {
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

  const css = `
    .${prefix}-grid{position:relative;display:block;}
    .${prefix}-grid-base{display:flex;flex-direction:column;gap:${rowGap};}
    .${prefix}-grid-row{align-items:stretch;}
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
    if (params.overlay && params.overlay.length > 0) {
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
      const flex = fixedSize
        ? `flex:0 0 ${fixedSize};`
        : resolved.span
          ? `flex:${resolved.span} 1 0;`
          : '';
      const style = resolved.style ?? {};
      const sizing =
        direction === 'row'
          ? `${minSize ? `min-width:${minSize};` : ''}${maxSize ? `max-width:${maxSize};` : ''}`
          : `${minSize ? `min-height:${minSize};` : ''}${maxSize ? `max-height:${maxSize};` : ''}`;
      const styleString = `${flex}${sizing}${Object.entries(style).map(([k, v]) => `${k}:${v}`).join(';')}`;
      const styleAttr = styleString ? ` style="${escapeHtml(styleString)}"` : '';
      if (rendered.css) {nestedCss.push(rendered.css);}
      if (rendered.behaviors.length) {nestedBehaviors.push(...rendered.behaviors);}
      return `<div class="${prefix}-stack-item${className} ${prefix}-util-surface" data-le-item data-le-index="${index}"${resizeAttr}${styleAttr}>${rendered.html}</div>`;
    })
    .join('\n');

  const html = `
    <div class="${prefix}-stack" data-le-layout="stack">
      ${itemsHtml}
    </div>
  `;

  const css = `
    .${prefix}-stack{display:flex;flex-direction:${direction};gap:${gap};align-items:${align};justify-content:${justify};flex-wrap:${params.wrap ? 'wrap' : 'nowrap'};}
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
    const result = buildGridLayout(composition.params, prefix, componentMap);
    const behaviors = [...(composition.behaviors ?? []), ...result.behaviors];
    return {html: result.html, css: result.css, behaviors, componentMap: result.componentMap};
  }
  if (composition.type === 'layout_parametric_stack') {
    const behaviors = [...(composition.behaviors ?? [])];
    const enableResize = behaviors.some(behavior => behavior.type === 'behavior_drag_resize');
    const result = buildStackLayout(composition.params, prefix, {enableResize, componentMap});
    const updatedHtml = enableResize
      ? injectRootAttributes(result.html, {
          'data-le-resize': true,
          'data-le-direction': composition.params.direction ?? 'row',
        })
      : result.html;
    return {html: updatedHtml, css: result.css, behaviors: [...behaviors, ...result.behaviors], componentMap: result.componentMap};
  }
  if (composition.type === 'component_parametric_viewer') {
    const result = buildViewerComponent(composition.params, prefix, componentMap);
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

export const recipeRegistry = {
  selectable_view: {
    name: 'selectable_view',
    description: 'Generic selectable view (tabs/carousel-like) with accessibility behaviors.',
    schema: zod.object({
      items: zod
        .array(
          zod.object({
            label: zod.string(),
            content: zod.string(),
          }),
        )
        .min(1),
      orientation: zod.enum(['horizontal', 'vertical']).optional(),
      variant: zod.enum(['tabs', 'carousel']).optional(),
      showControls: zod.boolean().optional(),
      showIndicators: zod.boolean().optional(),
    }),
  },
  parametric_grid: {
    name: 'parametric_grid',
    description: 'Generic grid layout recipe with rows/spans/gaps.',
    schema: zod.object({
      rows: zod.array(gridRowSchema).min(1),
      columnCount: zod.number().int().positive().optional(),
      unit: lengthSchema.optional(),
      gap: lengthSchema.optional(),
      rowGap: lengthSchema.optional(),
      rowHeight: lengthSchema.optional(),
      rowMinHeight: lengthSchema.optional(),
      rowLayout: zod.enum(['grid', 'flex']).optional(),
    }),
  },
  overlay_grid: {
    name: 'overlay_grid',
    description: 'Generic grid layout with overlay layers.',
    schema: zod.object({
      rows: zod.array(gridRowSchema).min(1),
      overlay: zod.array(gridOverlayLayerSchema).optional(),
      columnCount: zod.number().int().positive().optional(),
      unit: lengthSchema.optional(),
      gap: lengthSchema.optional(),
      rowGap: lengthSchema.optional(),
      rowHeight: lengthSchema.optional(),
      rowMinHeight: lengthSchema.optional(),
      rowLayout: zod.enum(['grid', 'flex']).optional(),
    }),
  },
  app_shell: {
    name: 'app_shell',
    description: 'Generic app shell with header/side/main regions.',
    schema: zod.object({
      headerHeight: lengthSchema.optional(),
      sidebarWidth: lengthSchema.optional(),
      showFooter: zod.boolean().optional(),
      footerHeight: lengthSchema.optional(),
      minHeight: lengthSchema.optional(),
    }),
  },
  two_column: {
    name: 'two_column',
    description: 'Two-column layout with sidebar and main content.',
    schema: zod.object({
      sidebarWidth: lengthSchema.optional(),
      minHeight: lengthSchema.optional(),
    }),
  },
  three_panel: {
    name: 'three_panel',
    description: 'Three-panel layout with nav, content, inspector.',
    schema: zod.object({
      navWidth: lengthSchema.optional(),
      inspectorWidth: lengthSchema.optional(),
      minHeight: lengthSchema.optional(),
    }),
  },
  toolbar: {
    name: 'toolbar',
    description: 'Generic toolbar with grouped buttons.',
    schema: zod.object({
      groups: zod
        .array(
          zod.object({
            label: zod.string().optional(),
            items: zod.array(zod.string()).min(1),
          }),
        )
        .min(1),
    }),
  },
  grid_canvas: {
    name: 'grid_canvas',
    description: 'Grid-based canvas for timeline/piano-roll style layouts.',
    schema: zod.object({
      rows: zod.number().int().positive(),
      columns: zod.number().int().positive(),
      cellSize: lengthSchema.optional(),
      showGrid: zod.boolean().optional(),
    }),
  },
} as const;

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
    'Generate a parametric layout in the live browser using layout atoms, behavior modules, and component compositions. Use either a recipe (preset) or an explicit composition.',
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
    recipe: recipeNameSchema.optional().describe('Named recipe/preset to use.'),
    recipeParams: zod
      .record(zod.any())
      .optional()
      .describe('Parameters for the selected recipe.'),
    composition: zod
      .preprocess(
        (val) => {
          // If the value is a string, try to parse it as JSON
          if (typeof val === 'string') {
            try {
              return JSON.parse(val);
            } catch {
              // If parsing fails, return the original value to let Zod handle the error
              return val;
            }
          }
          return val;
        },
        compositionSchema,
      )
      .optional()
      .describe('Explicit composition of layout atoms and components.'),
    behaviors: zod
      .array(behaviorSchema)
      .optional()
      .describe('Top-level behaviors to attach to the composition.'),
    theme: themeSchema.optional(),
    patch: patchSchema.optional(),
    verify: verifySchema.optional(),
  },
  handler: async (request, response, context) => {
    const catalog = (request.params as any).catalog;
    if (catalog) {
      await layoutLiveEditingRecipeCatalogHandler({params: catalog as any}, response, context);
      return;
    }

    const hasRecipe = Boolean(request.params.recipe);
    const hasComposition = Boolean(request.params.composition);
    if (!hasRecipe && !hasComposition) {
      throw new Error('Provide either recipe (with recipeParams) or composition.');
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
    const recordToSession = patch.recordToSession ?? false;
    const editSessionId = patch.editSessionId;

    if (hasRecipe && request.params.recipe) {
      const registry = recipeRegistry[request.params.recipe];
      if (!registry) {
        throw new Error(`Unknown recipe: ${request.params.recipe}`);
      }
      if (request.params.recipeParams) {
        const parsed = registry.schema.safeParse(request.params.recipeParams);
        if (!parsed.success) {
          throw new Error(`Invalid recipeParams for ${request.params.recipe}: ${parsed.error.message}`);
        }
      }
    }

    let resolvedComposition = request.params.composition;
    let resolvedBehaviors = request.params.behaviors ?? [];

    if (request.params.recipe) {
      const recipeParams = (request.params.recipeParams ?? {}) as Record<string, any>;
      switch (request.params.recipe) {
        case 'selectable_view':
          resolvedComposition = {
            type: 'component_parametric_viewer',
            params: {
              items: recipeParams.items ?? [],
              orientation: recipeParams.orientation,
              variant: recipeParams.variant,
              showControls: recipeParams.showControls,
              showIndicators: recipeParams.showIndicators,
            },
            behaviors: [],
          };
          resolvedBehaviors = [
            {type: 'behavior_selectable', params: {multiSelect: false}},
            {
              type: 'behavior_roving_focus',
              params: {axis: recipeParams.orientation === 'vertical' ? 'y' : 'x'},
            },
            {type: 'behavior_aria_pattern', params: {pattern: 'tabs'}},
            ...resolvedBehaviors,
          ];
          break;
        case 'parametric_grid':
          resolvedComposition = {
            type: 'layout_parametric_grid',
            params: {
              rows: recipeParams.rows ?? [],
              columnCount: recipeParams.columnCount,
              unit: recipeParams.unit,
              gap: recipeParams.gap,
              rowGap: recipeParams.rowGap,
              rowHeight: recipeParams.rowHeight,
              rowMinHeight: recipeParams.rowMinHeight,
              rowLayout: recipeParams.rowLayout,
            },
            behaviors: [],
          };
          break;
        case 'overlay_grid':
          resolvedComposition = {
            type: 'layout_parametric_grid',
            params: {
              rows: recipeParams.rows ?? [],
              overlay: recipeParams.overlay ?? [],
              columnCount: recipeParams.columnCount,
              unit: recipeParams.unit,
              gap: recipeParams.gap,
              rowGap: recipeParams.rowGap,
              rowHeight: recipeParams.rowHeight,
              rowMinHeight: recipeParams.rowMinHeight,
              rowLayout: recipeParams.rowLayout,
            },
            behaviors: [],
          };
          break;
        case 'app_shell': {
          const headerHeight = recipeParams.headerHeight ?? '56px';
          const sidebarWidth = recipeParams.sidebarWidth ?? '240px';
          const showFooter = recipeParams.showFooter ?? false;
          const footerHeight = recipeParams.footerHeight ?? '48px';
          const minHeight = recipeParams.minHeight ?? '420px';
          const footer = showFooter
            ? {
                composition: {
                  type: 'layout_parametric_stack',
                  params: {direction: 'row', items: ['Footer']},
                },
                style: {height: String(footerHeight)},
                className: `${prefix}-util-panel`,
              }
            : null;
          resolvedComposition = {
            type: 'layout_parametric_stack',
            params: {
              direction: 'column',
              items: [
                {
                  composition: {
                    type: 'layout_parametric_stack',
                    params: {direction: 'row', items: ['Header']},
                  },
                  style: {height: String(headerHeight)},
                  className: `${prefix}-util-panel`,
                },
                {
                  composition: {
                    type: 'layout_parametric_stack',
                    params: {
                      direction: 'row',
                      items: [
                        {
                          composition: {
                            type: 'layout_parametric_stack',
                            params: {direction: 'column', items: ['Sidebar']},
                          },
                          style: {width: String(sidebarWidth)},
                          className: `${prefix}-util-panel`,
                        },
                        {
                          composition: {
                            type: 'layout_parametric_stack',
                            params: {direction: 'column', items: ['Main']},
                          },
                          className: `${prefix}-util-panel`,
                        },
                      ],
                    },
                  },
                  style: {minHeight: String(minHeight)},
                },
                ...(footer ? [footer] : []),
              ],
            },
          };
          break;
        }
        case 'two_column': {
          const sidebarWidth = recipeParams.sidebarWidth ?? '280px';
          const minHeight = recipeParams.minHeight ?? '360px';
          resolvedComposition = {
            type: 'layout_parametric_stack',
            params: {
              direction: 'row',
              items: [
                {
                  composition: {
                    type: 'layout_parametric_stack',
                    params: {direction: 'column', items: ['Sidebar']},
                  },
                  style: {width: String(sidebarWidth)},
                  className: `${prefix}-util-panel`,
                },
                {
                  composition: {
                    type: 'layout_parametric_stack',
                    params: {direction: 'column', items: ['Main']},
                  },
                  style: {minHeight: String(minHeight)},
                  className: `${prefix}-util-panel`,
                },
              ],
            },
          };
          break;
        }
        case 'three_panel': {
          const navWidth = recipeParams.navWidth ?? '220px';
          const inspectorWidth = recipeParams.inspectorWidth ?? '280px';
          const minHeight = recipeParams.minHeight ?? '360px';
          resolvedComposition = {
            type: 'layout_parametric_stack',
            params: {
              direction: 'row',
              items: [
                {
                  composition: {
                    type: 'layout_parametric_stack',
                    params: {direction: 'column', items: ['Nav']},
                  },
                  style: {width: String(navWidth)},
                  className: `${prefix}-util-panel`,
                },
                {
                  composition: {
                    type: 'layout_parametric_stack',
                    params: {direction: 'column', items: ['Content']},
                  },
                  style: {minHeight: String(minHeight)},
                  className: `${prefix}-util-panel`,
                },
                {
                  composition: {
                    type: 'layout_parametric_stack',
                    params: {direction: 'column', items: ['Inspector']},
                  },
                  style: {width: String(inspectorWidth)},
                  className: `${prefix}-util-panel`,
                },
              ],
            },
          };
          break;
        }
        case 'toolbar': {
          const groups = Array.isArray(recipeParams.groups) ? recipeParams.groups : [];
          resolvedComposition = {
            type: 'layout_parametric_stack',
            params: {
              direction: 'row',
              items: groups.map((group: any) => ({
                composition: {
                  type: 'layout_parametric_stack',
                  params: {
                    direction: 'row',
                    items: (group.items ?? []).map((label: string) => ({
                      label,
                      content: escapeHtml(label),
                      className: `${prefix}-util-btn`,
                    })),
                  },
                },
                className: `${prefix}-util-toolbar-group`,
              })),
            },
          };
          break;
        }
        case 'grid_canvas': {
          const rows = Math.max(1, Number(recipeParams.rows ?? 8));
          const columns = Math.max(1, Number(recipeParams.columns ?? 16));
          const cellSize = normalizeLength(recipeParams.cellSize ?? 24) ?? '24px';
          const showGrid = recipeParams.showGrid ?? true;
          const rowItems = Array.from({length: columns}, (_, i) => ({
            content: '',
            className: showGrid ? `${prefix}-util-muted` : '',
            style: showGrid
              ? {
                  borderRight: `1px solid var(--${prefix}-border)`,
                  borderBottom: `1px solid var(--${prefix}-border)`,
                  minHeight: cellSize,
                }
              : {minHeight: cellSize},
          }));
          const rowsDef = Array.from({length: rows}, () => ({
            items: rowItems,
          }));
          resolvedComposition = {
            type: 'layout_parametric_grid',
            params: {
              rows: rowsDef,
              unit: cellSize,
              gap: 0,
            },
          };
          break;
        }
        default:
          throw new Error(`Unknown recipe: ${request.params.recipe}`);
      }
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
      ${scopeSelector}{${rootVars}font-family:var(--${prefix}-font);}
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

    if (mode === 'export_only') {
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

    const domResult = await page.evaluate(
      ({selector, position, html, patchId, replaceExisting, PATCH_ID_ATTR}) => {
        const target = document.querySelector(selector);
        if (!target) {
          return {success: false, reason: 'target_not_found', selector};
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
          return {success: true, selector, replaced: true};
        }
        if (document.querySelector(`[${PATCH_ID_ATTR}="${patchId}"]`)) {
          return {success: false, reason: 'patch_exists', patchId};
        }
        target.insertAdjacentHTML(position, html);
        return {success: true, selector};
      },
      {
        selector: target.selector ?? 'body',
        position: target.position ?? 'beforeend',
        html: rootHtml,
        patchId: domPatchId,
        replaceExisting,
        PATCH_ID_ATTR,
      },
    );

    if (!domResult.success && domResult.reason === 'patch_exists' && !replaceExisting) {
      response.appendResponseLine(
        `DOM patch skipped (patch exists): ${domPatchId}. Use replaceExisting to overwrite.`,
      );
    } else if (!domResult.success) {
      throw new Error(`Failed to insert DOM: ${domResult.reason ?? 'unknown error'}`);
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

    const cssApply = await page.evaluate(
      ({cssText, patchId, replaceExisting, PATCH_ID_ATTR, PATCH_OWNER_ATTR, PATCH_KIND_ATTR, PATCH_OWNER_VALUE}) => {
        const existing = Array.from(
          document.querySelectorAll(`style[${PATCH_ID_ATTR}]`),
        ).find(el => el.getAttribute(PATCH_ID_ATTR) === patchId) as HTMLStyleElement | undefined;
        if (existing && !replaceExisting) {
          return {applied: false, reason: 'patch_exists'};
        }
        if (existing) {
          existing.textContent = cssText;
          return {applied: true, replaced: true};
        }
        const style = document.createElement('style');
        style.setAttribute(PATCH_ID_ATTR, patchId);
        style.setAttribute(PATCH_OWNER_ATTR, PATCH_OWNER_VALUE);
        style.setAttribute(PATCH_KIND_ATTR, 'css');
        style.textContent = cssText;
        document.head.appendChild(style);
        return {applied: true};
      },
      {
        cssText: scopedCss,
        patchId: cssPatchId,
        replaceExisting,
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
              cssText: scopedCss,
              patchId: cssPatchId,
              replaceExisting,
            },
          },
          {sessionId: editSessionId, autoCreate: true},
        );
      }
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

    if (request.params.verify?.wireframeSnapshot) {
      await wireframeSnapshotLiveEditing.handler({params: {} as any}, response, context);
    }
    if (request.params.verify?.svgSnapshot) {
      await svgSnapshotLiveEditing.handler({params: {} as any}, response, context);
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

