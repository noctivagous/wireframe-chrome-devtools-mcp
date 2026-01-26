/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {lengthSchema, normalizeLength} from './utils.js';

export const twoColumnRecipe: {
  name: 'two_column';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'two_column' as const,
  description: 'Two-column layout with sidebar and main content.',
  schema: zod.object({
    sidebarWidth: lengthSchema.optional(),
    minHeight: lengthSchema.optional(),
  }),
  execute: (params: zod.infer<typeof twoColumnRecipe.schema>, prefix: string) => {
    const sidebarWidth = normalizeLength(params.sidebarWidth) ?? '280px';
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
              items: ['Sidebar'],
            },
            style: {width: sidebarWidth},
            className: `${prefix}-util-panel`,
          },
          {
            composition: {
              type: 'layout_parametric_stack',
              direction: 'column',
              items: ['Main'],
            },
            style: {minHeight: minHeight, flex: '1 1 auto'},
            className: `${prefix}-util-panel`,
          },
        ],
      },
      behaviors: [],
    };
  },
};

