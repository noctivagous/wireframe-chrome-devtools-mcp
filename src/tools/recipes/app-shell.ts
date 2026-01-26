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
    const headerHeight = params.headerHeight ?? '56px';
    const sidebarWidth = params.sidebarWidth ?? '240px';
    const showFooter = params.showFooter ?? false;
    const footerHeight = params.footerHeight ?? '48px';
    const minHeight = params.minHeight ?? '420px';
    const footer = showFooter
      ? {
          composition: {
            type: 'layout_parametric_stack',
            direction: 'row',
            items: ['Footer'],
          },
          style: {height: normalizeLength(footerHeight) ?? '48px'},
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
            style: {height: normalizeLength(headerHeight) ?? '56px'},
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
                  style: {width: normalizeLength(sidebarWidth) ?? '240px'},
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
            style: {minHeight: normalizeLength(minHeight) ?? '420px'},
          },
          ...(footer ? [footer] : []),
        ],
      },
      behaviors: [],
    };
  },
};

