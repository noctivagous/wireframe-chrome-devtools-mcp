/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {lengthSchema, normalizeLength} from './utils.js';

export const masterDetailRecipe: {
  name: 'master_detail';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'master_detail' as const,
  description: 'Split view with master list on left and detail panel on right.',
  schema: zod.object({
    masterWidth: lengthSchema.optional(),
    detailMinWidth: lengthSchema.optional(),
    resizable: zod.coerce.boolean().optional(),
    defaultSplit: zod.number().min(0).max(1).optional(),
  }),
  execute: (params: zod.infer<typeof masterDetailRecipe.schema>, prefix: string) => {
    const defaultSplit = params.defaultSplit ?? 0.3;
    const masterWidth = normalizeLength(params.masterWidth) ?? `${defaultSplit * 100}%`;
    const detailMinWidth = normalizeLength(params.detailMinWidth) ?? '300px';
    const resizable = params.resizable ?? false;

    return {
      composition: {
        type: 'layout_parametric_stack',
        direction: 'row',
        items: [
          {
            composition: {
              type: 'layout_parametric_stack',
              direction: 'column',
              items: ['Master List'],
            },
            style: {
              width: masterWidth,
              flexShrink: resizable ? '1' : '0',
              minWidth: resizable ? '200px' : undefined,
            },
            className: `${prefix}-util-panel`,
          },
          ...(resizable
            ? [
                {
                  composition: {
                    type: 'layout_parametric_stack',
                    direction: 'column',
                    items: [''],
                  },
                  style: {
                    width: '4px',
                    cursor: 'col-resize',
                    backgroundColor: '#e0e0e0',
                  },
                  className: `${prefix}-resize-handle`,
                },
              ]
            : []),
          {
            composition: {
              type: 'layout_parametric_stack',
              direction: 'column',
              items: ['Detail'],
            },
            style: {
              flex: '1 1 auto',
              minWidth: detailMinWidth,
            },
            className: `${prefix}-util-panel`,
          },
        ],
      },
      behaviors: resizable
        ? [
            {
              type: 'behavior_drag_resize',
              params: {
                axis: 'x',
                minSize: '200px',
              },
            },
          ]
        : [],
    };
  },
};

