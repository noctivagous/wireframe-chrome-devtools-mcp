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
    const sidebarWidth = params.sidebarWidth ?? '280px';
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
              items: ['Sidebar'],
            },
            style: {width: normalizeLength(sidebarWidth) ?? '280px'},
            className: `${prefix}-util-panel`,
          },
          {
            composition: {
              type: 'layout_parametric_stack',
              direction: 'column',
              items: ['Main'],
            },
            style: {minHeight: normalizeLength(minHeight) ?? '360px'},
            className: `${prefix}-util-panel`,
          },
        ],
      },
      behaviors: [],
    };
  },
};

