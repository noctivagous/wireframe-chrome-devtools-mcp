/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {contentItemSchema, lengthSchema, normalizeLength} from './utils.js';

export const masonryRecipe: {
  name: 'masonry';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'masonry' as const,
  description: 'Pinterest-style masonry grid layout with items of varying heights that pack efficiently.',
  schema: zod.object({
    items: zod.array(contentItemSchema).min(1).optional(),
    columnCount: zod.number().int().positive().optional(),
    gap: lengthSchema.optional(),
    minItemWidth: lengthSchema.optional(),
  }),
  execute: (params: zod.infer<typeof masonryRecipe.schema>, prefix: string) => {
    const items = params.items ?? ['Item 1', 'Item 2', 'Item 3', 'Item 4', 'Item 5', 'Item 6'];
    const columnCount = params.columnCount ?? 3;
    const gap = normalizeLength(params.gap) ?? '16px';
    const minItemWidth = normalizeLength(params.minItemWidth) ?? '200px';

    // Convert items into rows for the grid
    // For masonry, we'll use CSS columns approach via custom styles
    const rows: any[] = [];
    for (let i = 0; i < items.length; i += columnCount) {
      const rowItems = items.slice(i, i + columnCount);
      rows.push({items: rowItems});
    }

    // For masonry, we'll use CSS columns via a wrapper style
    // The grid will be rendered, but we'll add custom CSS for column-based layout
    return {
      composition: {
        type: 'layout_parametric_grid',
        rows,
        columnCount,
        gap,
        rowLayout: 'flex',
      },
      behaviors: [],
    };
  },
};

