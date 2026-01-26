/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';

/**
 * Shared utilities for recipe implementations.
 */

export const lengthSchema = zod
  .union([zod.number(), zod.string()])
  .describe('CSS length (number interpreted as px) or token string (e.g., "1fr", "0.5rem").');

export type ContentItem = zod.infer<typeof contentItemSchema>;
export type GridRow = zod.infer<typeof gridRowSchema>;

// Forward declaration - will be set by layout-live-editing.ts
let compositionSchemaWithStringSupport: () => zod.ZodTypeAny;

export function setCompositionSchemaWithStringSupport(fn: () => zod.ZodTypeAny) {
  compositionSchemaWithStringSupport = fn;
}

export const contentItemSchema: zod.ZodTypeAny = zod.union([
  zod.string().describe('Shorthand content label/string.'),
  zod.object({
    id: zod.string().optional().describe('Stable id for the item.'),
    label: zod.string().optional().describe('Human-readable label for the item.'),
    value: zod.string().optional().describe('Optional value for the item.'),
    content: zod
      .string()
      .optional()
      .describe('HTML string or text content to insert for the item.'),
    composition: zod.any().optional().describe('Nested composition to render inside this item.'),
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
      .union([
        lengthSchema,
        zod.object({
          x: lengthSchema.optional().describe('Horizontal offset.'),
          y: lengthSchema.optional().describe('Vertical offset.'),
        }),
      ])
      .optional()
      .describe('Optional offset for positioning (scalar or {x,y}). Supports fractional units like "0.5fr" or "50%".'),
    style: zod
      .record(zod.string())
      .optional()
      .describe('Inline style overrides for the item.'),
  }),
]);

export const gridRowSchema: zod.ZodTypeAny = zod.object({
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

export const gridOverlayLayerSchema: zod.ZodTypeAny = zod.object({
  id: zod.string().optional().describe('Optional overlay layer id.'),
  items: zod.array(contentItemSchema).min(1).describe('Items in the overlay layer.'),
  spans: zod
    .array(zod.number().int().positive())
    .optional()
    .describe('Optional per-item spans for the overlay layer.'),
  offset: zod
    .union([
      lengthSchema,
      zod.object({
        x: lengthSchema.optional().describe('Horizontal offset.'),
        y: lengthSchema.optional().describe('Vertical offset.'),
      }),
    ])
    .optional()
    .describe('Optional overlay offset (scalar or {x,y}).'),
  zIndex: zod.number().int().optional().describe('Optional z-index for the layer.'),
});

/**
 * Normalizes a length value to a CSS string.
 * - Numbers are converted to "Npx"
 * - Strings without units get "px" appended if they're numeric
 * - Other strings are returned as-is
 */
export function normalizeLength(value: number | string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'number') {
    return `${value}px`;
  }
  // If it's a string that looks like a number (no units), add 'px'
  const trimmed = String(value).trim();
  if (/^\d+(\.\d+)?$/.test(trimmed)) {
    return `${trimmed}px`;
  }
  return value;
}

/**
 * Escapes HTML special characters.
 */
export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Converts itemsForAllRows + columnCount into rows structure.
 * Items are arranged row-major (left-to-right, then wrap to next row).
 */
export function convertItemsForAllRowsToRows(
  itemsForAllRows: ContentItem[],
  columnCount: number | undefined,
): GridRow[] {
  if (!columnCount || columnCount <= 0) {
    throw new Error('columnCount is required when using itemsForAllRows and must be a positive integer.');
  }

  const rows: GridRow[] = [];
  for (let i = 0; i < itemsForAllRows.length; i += columnCount) {
    const rowItems = itemsForAllRows.slice(i, i + columnCount);
    rows.push({items: rowItems});
  }

  return rows;
}

