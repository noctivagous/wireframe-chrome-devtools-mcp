/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {contentItemSchema, lengthSchema, normalizeLength, convertItemsForAllRowsToRows} from './utils.js';

export const dashboardRecipe: {
  name: 'dashboard';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'dashboard' as const,
  description: 'Multi-column dashboard layout optimized for metrics and stats.',
  schema: zod.object({
    columns: zod.number().int().positive().optional(),
    rowCount: zod.number().int().positive().optional(),
    cardHeight: lengthSchema.optional(),
    gap: lengthSchema.optional(),
    showHeader: zod.coerce.boolean().optional(),
  }),
  execute: (params: zod.infer<typeof dashboardRecipe.schema>, prefix: string) => {
    const columns = params.columns ?? 4;
    const rowCount = params.rowCount ?? 3;
    const cardHeight = normalizeLength(params.cardHeight) ?? '200px';
    const gap = normalizeLength(params.gap) ?? '16px';
    const showHeader = params.showHeader ?? true;

    // Generate metric cards
    const totalCards = columns * rowCount;
    const items: any[] = [];
    for (let i = 0; i < totalCards; i++) {
      items.push({
        composition: {
          type: 'layout_parametric_stack',
          direction: 'column',
          items: [`Metric ${i + 1}`],
        },
        style: {height: cardHeight},
        className: `${prefix}-util-panel`,
      });
    }

    const rows = convertItemsForAllRowsToRows(items, columns);

    const gridComposition = {
      type: 'layout_parametric_grid',
      rows,
      columnCount: columns,
      gap,
    };

    const itemsForStack: any[] = [];
    if (showHeader) {
      itemsForStack.push({
        composition: {
          type: 'layout_parametric_stack',
          direction: 'row',
          items: ['Dashboard Header'],
        },
        style: {height: '64px'},
        className: `${prefix}-util-panel`,
      });
    }
    itemsForStack.push({
      composition: gridComposition,
      style: {flex: '1 1 auto', padding: gap},
      className: `${prefix}-grid-container`,
    });

    return {
      composition: {
        type: 'layout_parametric_stack',
        direction: 'column',
        items: itemsForStack,
      },
      behaviors: [],
    };
  },
};

