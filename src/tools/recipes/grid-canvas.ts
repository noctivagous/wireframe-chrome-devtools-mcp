/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {lengthSchema, normalizeLength} from './utils.js';

export const gridCanvasRecipe: {
  name: 'grid_canvas';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'grid_canvas' as const,
  description: 'Grid-based canvas for timeline/piano-roll style layouts.',
  schema: zod.object({
    rows: zod.number().int().positive(),
    columns: zod.number().int().positive(),
    cellSize: lengthSchema.optional(),
    showGrid: zod.coerce.boolean().optional(),
  }),
  execute: (params: zod.infer<typeof gridCanvasRecipe.schema>, prefix: string) => {
    const rows = Math.max(1, Number(params.rows ?? 8));
    const columns = Math.max(1, Number(params.columns ?? 16));
    const cellSize = normalizeLength(params.cellSize ?? 24) ?? '24px';
    const showGrid = params.showGrid ?? true;
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
    return {
      composition: {
        type: 'layout_parametric_grid',
        rows: rowsDef,
        unit: cellSize,
        gap: 0,
      },
      behaviors: [],
    };
  },
};

