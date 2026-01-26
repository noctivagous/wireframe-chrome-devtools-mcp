/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {lengthSchema, normalizeLength} from './utils.js';

export const splitScreenRecipe: {
  name: 'split_screen';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'split_screen' as const,
  description: 'Two equal or custom-split panels side by side.',
  schema: zod.object({
    splitRatio: zod.number().min(0).max(1).optional(),
    resizable: zod.coerce.boolean().optional(),
    orientation: zod.enum(['horizontal', 'vertical']).optional(),
    minPanelSize: lengthSchema.optional(),
  }),
  execute: (params: zod.infer<typeof splitScreenRecipe.schema>, prefix: string) => {
    const splitRatio = params.splitRatio ?? 0.5;
    const resizable = params.resizable ?? false;
    const orientation = params.orientation ?? 'horizontal';
    const minPanelSize = normalizeLength(params.minPanelSize) ?? '200px';

    const direction = orientation === 'horizontal' ? 'row' : 'column';
    const firstPanelSize = `${splitRatio * 100}%`;
    const secondPanelSize = `${(1 - splitRatio) * 100}%`;

    const items: any[] = [
      {
        composition: {
          type: 'layout_parametric_stack',
          direction: direction === 'row' ? 'column' : 'row',
          items: ['Panel 1'],
        },
        style: {
          [direction === 'row' ? 'width' : 'height']: firstPanelSize,
          flexShrink: resizable ? '1' : '0',
          [direction === 'row' ? 'minWidth' : 'minHeight']: minPanelSize,
        },
        className: `${prefix}-util-panel`,
      },
    ];

    if (resizable) {
      items.push({
        composition: {
          type: 'layout_parametric_stack',
          direction: direction === 'row' ? 'column' : 'row',
          items: [''],
        },
        style: {
          [direction === 'row' ? 'width' : 'height']: '4px',
          cursor: direction === 'row' ? 'col-resize' : 'row-resize',
          backgroundColor: '#e0e0e0',
        },
        className: `${prefix}-resize-handle`,
      });
    }

    items.push({
      composition: {
        type: 'layout_parametric_stack',
        direction: direction === 'row' ? 'column' : 'row',
        items: ['Panel 2'],
      },
      style: {
        flex: '1 1 auto',
        [direction === 'row' ? 'minWidth' : 'minHeight']: minPanelSize,
      },
      className: `${prefix}-util-panel`,
    });

    return {
      composition: {
        type: 'layout_parametric_stack',
        direction,
        items,
      },
      behaviors: resizable
        ? [
            {
              type: 'behavior_drag_resize',
              params: {
                axis: orientation === 'horizontal' ? 'x' : 'y',
                minSize: minPanelSize,
              },
            },
          ]
        : [],
    };
  },
};

