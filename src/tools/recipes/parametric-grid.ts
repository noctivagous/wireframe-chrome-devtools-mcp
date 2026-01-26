/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {gridRowSchema, lengthSchema, contentItemSchema, convertItemsForAllRowsToRows, type GridRow} from './utils.js';

export const parametricGridRecipe: {
  name: 'parametric_grid';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'parametric_grid' as const,
  description: 'Generic grid layout recipe with rows/spans/gaps.',
  schema: zod.object({
    rows: zod.array(gridRowSchema).min(1).optional(),
    itemsForAllRows: zod.array(contentItemSchema).min(1).optional(),
    columnCount: zod.number().int().positive().optional(),
    unit: lengthSchema.optional(),
    gap: lengthSchema.optional(),
    columnGap: lengthSchema.optional(),
    rowGap: lengthSchema.optional(),
    rowHeight: lengthSchema.optional(),
    rowMinHeight: lengthSchema.optional(),
    rowLayout: zod.enum(['grid', 'flex']).optional(),
  }).refine(
    (data) => Boolean(data.rows) !== Boolean(data.itemsForAllRows),
    {
      message: 'Either rows or itemsForAllRows must be provided, but not both.',
    }
  ).refine(
    (data) => !data.itemsForAllRows || (data.columnCount !== undefined && data.columnCount > 0),
    {
      message: 'columnCount is required when using itemsForAllRows and must be a positive integer.',
    }
  ),
  execute: (params: zod.infer<typeof parametricGridRecipe.schema>, prefix: string) => {
    // Convert itemsForAllRows to rows if provided
    let rows: GridRow[] | undefined = params.rows;
    if (params.itemsForAllRows) {
      rows = convertItemsForAllRowsToRows(
        params.itemsForAllRows,
        params.columnCount,
      );
    }
    if (!rows || rows.length === 0) {
      throw new Error('Either rows or itemsForAllRows must be provided for parametric_grid recipe.');
    }
    return {
      composition: {
        type: 'layout_parametric_grid',
        rows,
        columnCount: params.columnCount,
        unit: params.unit,
        gap: params.gap,
        columnGap: params.columnGap,
        rowGap: params.rowGap,
        rowHeight: params.rowHeight,
        rowMinHeight: params.rowMinHeight,
        rowLayout: params.rowLayout,
        behaviors: [],
      },
      behaviors: [],
    };
  },
};

