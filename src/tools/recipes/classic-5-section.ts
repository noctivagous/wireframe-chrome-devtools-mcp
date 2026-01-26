/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {lengthSchema, normalizeLength} from './utils.js';

export const classic5SectionRecipe: {
  name: 'classic_5_section';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'classic_5_section' as const,
  description: 'Classic 5-section layout (holy grail) with header, footer, left sidebar, main content, and right sidebar.',
  schema: zod.object({
    headerHeight: lengthSchema.optional(),
    leftSidebarWidth: lengthSchema.optional(),
    rightSidebarWidth: lengthSchema.optional(),
    footerHeight: lengthSchema.optional(),
    minHeight: lengthSchema.optional(),
  }),
  execute: (params: zod.infer<typeof classic5SectionRecipe.schema>, prefix: string) => {
    const headerHeight = normalizeLength(params.headerHeight) ?? '56px';
    const leftSidebarWidth = normalizeLength(params.leftSidebarWidth) ?? '240px';
    const rightSidebarWidth = normalizeLength(params.rightSidebarWidth) ?? '240px';
    const footerHeight = normalizeLength(params.footerHeight) ?? '48px';
    const contentHeight = `calc(100vh - ${headerHeight} - ${footerHeight})`;
    const minHeight = normalizeLength(params.minHeight) ?? contentHeight;

    return {
      composition: {
        type: 'layout_parametric_stack',
        direction: 'column',
        items: [
          {
            composition: {
              type: 'layout_parametric_stack',
              direction: 'row',
              items: ['Header'],
            },
            style: {height: headerHeight},
            className: `${prefix}-util-panel`,
          },
          {
            composition: {
              type: 'layout_parametric_stack',
              direction: 'row',
              items: [
                {
                  composition: {
                    type: 'layout_parametric_stack',
                    direction: 'column',
                    items: ['Left Sidebar'],
                  },
                  style: {width: leftSidebarWidth},
                  className: `${prefix}-util-panel`,
                },
                {
                  composition: {
                    type: 'layout_parametric_stack',
                    direction: 'column',
                    items: ['Main'],
                  },
                  style: {flex: '1 1 auto'},
                  className: `${prefix}-util-panel`,
                },
                {
                  composition: {
                    type: 'layout_parametric_stack',
                    direction: 'column',
                    items: ['Right Sidebar'],
                  },
                  style: {width: rightSidebarWidth},
                  className: `${prefix}-util-panel`,
                },
              ],
            },
            style: {minHeight: minHeight, flex: '1 1 auto'},
          },
          {
            composition: {
              type: 'layout_parametric_stack',
              direction: 'row',
              items: ['Footer'],
            },
            style: {height: footerHeight},
            className: `${prefix}-util-panel`,
          },
        ],
      },
      behaviors: [],
    };
  },
};

