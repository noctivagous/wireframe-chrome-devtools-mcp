/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {gridRowSchema, gridOverlayLayerSchema, lengthSchema} from './utils.js';

export const overlayGridRecipe: {
  name: 'overlay_grid';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'overlay_grid' as const,
  description: 'Generic grid layout with overlay layers.',
  schema: zod.object({
    rows: zod.array(gridRowSchema).min(1),
    layers: zod.array(gridOverlayLayerSchema).optional(),
    columnCount: zod.number().int().positive().optional(),
    unit: lengthSchema.optional(),
    gap: lengthSchema.optional(),
    columnGap: lengthSchema.optional(),
    rowGap: lengthSchema.optional(),
    rowHeight: lengthSchema.optional(),
    rowMinHeight: lengthSchema.optional(),
    rowLayout: zod.enum(['grid', 'flex']).optional(),
  }),
  execute: (params: zod.infer<typeof overlayGridRecipe.schema>, prefix: string) => {
    return {
      composition: {
        type: 'layout_parametric_grid',
        rows: params.rows ?? [],
        layers: params.layers ?? [],
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

