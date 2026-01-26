/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {lengthSchema, normalizeLength} from './utils.js';

export const threePanelRecipe: {
  name: 'three_panel';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'three_panel' as const,
  description: 'Three-panel layout with nav, content, inspector.',
  schema: zod.object({
    navWidth: lengthSchema.optional(),
    inspectorWidth: lengthSchema.optional(),
    minHeight: lengthSchema.optional(),
  }),
  execute: (params: zod.infer<typeof threePanelRecipe.schema>, prefix: string) => {
    const navWidth = params.navWidth ?? '220px';
    const inspectorWidth = params.inspectorWidth ?? '280px';
    const minHeight = params.minHeight ?? '360px';
    return {
      composition: {
        type: 'layout_parametric_stack',
        direction: 'row',
        items: [
          {
            composition: {
              type: 'layout_parametric_stack',
              direction: 'column',
              items: ['Nav'],
            },
            style: {width: normalizeLength(navWidth) ?? '220px'},
            className: `${prefix}-util-panel`,
          },
          {
            composition: {
              type: 'layout_parametric_stack',
              direction: 'column',
              items: ['Content'],
            },
            style: {minHeight: normalizeLength(minHeight) ?? '360px'},
            className: `${prefix}-util-panel`,
          },
          {
            composition: {
              type: 'layout_parametric_stack',
              direction: 'column',
              items: ['Inspector'],
            },
            style: {width: normalizeLength(inspectorWidth) ?? '280px'},
            className: `${prefix}-util-panel`,
          },
        ],
      },
      behaviors: [],
    };
  },
};

