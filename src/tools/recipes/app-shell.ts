/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {lengthSchema, normalizeLength} from './utils.js';

export const appShellRecipe: {
  name: 'app_shell';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'app_shell' as const,
  description: 'Generic app shell with header/side/main regions.',
  schema: zod.object({
    headerHeight: lengthSchema.optional(),
    sidebarWidth: lengthSchema.optional(),
    showFooter: zod.coerce.boolean().optional(),
    footerHeight: lengthSchema.optional(),
    minHeight: lengthSchema.optional(),
  }),
  execute: (params: zod.infer<typeof appShellRecipe.schema>, prefix: string) => {
    const headerHeight = normalizeLength(params.headerHeight) ?? '56px';
    const sidebarWidth = normalizeLength(params.sidebarWidth) ?? '240px';
    const showFooter = params.showFooter ?? false;
    const footerHeight = normalizeLength(params.footerHeight) ?? '48px';
    // Use viewport-filling height for better testing defaults
    const contentHeight = showFooter
      ? `calc(100vh - ${headerHeight} - ${footerHeight})`
      : `calc(100vh - ${headerHeight})`;
    const minHeight = normalizeLength(params.minHeight) ?? contentHeight;
    const footer = showFooter
      ? {
          composition: {
            type: 'layout_parametric_stack',
            direction: 'row',
            items: ['Footer'],
          },
          style: {height: footerHeight},
          className: `${prefix}-util-panel`,
        }
      : null;
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
                  className: `${prefix}-util-panel`,
                },
              ],
            },
            style: {minHeight: minHeight, flex: '1 1 auto'},
          },
          ...(footer ? [footer] : []),
        ],
      },
      behaviors: [],
    };
  },
};

