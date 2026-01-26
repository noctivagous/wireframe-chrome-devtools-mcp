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
    const navWidth = normalizeLength(params.navWidth) ?? '220px';
    const inspectorWidth = normalizeLength(params.inspectorWidth) ?? '280px';
    // Use viewport-filling height for better testing defaults
    const minHeight = normalizeLength(params.minHeight) ?? '100vh';
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
            style: {width: navWidth},
            className: `${prefix}-util-panel`,
          },
          {
            composition: {
              type: 'layout_parametric_stack',
              direction: 'column',
              items: ['Content'],
            },
            style: {minHeight: minHeight, flex: '1 1 auto'},
            className: `${prefix}-util-panel`,
          },
          {
            composition: {
              type: 'layout_parametric_stack',
              direction: 'column',
              items: ['Inspector'],
            },
            style: {width: inspectorWidth},
            className: `${prefix}-util-panel`,
          },
        ],
      },
      behaviors: [],
    };
  },
};

