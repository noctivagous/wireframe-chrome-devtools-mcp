/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {lengthSchema, normalizeLength} from './utils.js';

export const stickyHeaderFooterRecipe: {
  name: 'sticky_header_footer';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'sticky_header_footer' as const,
  description: 'Fixed/sticky header and footer with scrollable main content area.',
  schema: zod.object({
    headerHeight: lengthSchema.optional(),
    footerHeight: lengthSchema.optional(),
    headerSticky: zod.coerce.boolean().optional(),
    footerSticky: zod.coerce.boolean().optional(),
  }),
  execute: (params: zod.infer<typeof stickyHeaderFooterRecipe.schema>, prefix: string) => {
    const headerHeight = normalizeLength(params.headerHeight) ?? '56px';
    const footerHeight = normalizeLength(params.footerHeight) ?? '48px';
    const headerSticky = params.headerSticky ?? false;
    const footerSticky = params.footerSticky ?? false;
    const contentHeight = `calc(100vh - ${headerHeight} - ${footerHeight})`;

    const headerPosition = headerSticky ? 'sticky' : 'fixed';
    const footerPosition = footerSticky ? 'sticky' : 'fixed';

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
            style: {
              height: headerHeight,
              position: headerPosition,
              top: '0',
              left: '0',
              right: '0',
              zIndex: '1000',
            },
            className: `${prefix}-util-panel`,
          },
          {
            composition: {
              type: 'layout_parametric_stack',
              direction: 'column',
              items: ['Content'],
            },
            style: {
              minHeight: contentHeight,
              paddingTop: headerPosition === 'fixed' ? headerHeight : '0',
              paddingBottom: footerPosition === 'fixed' ? footerHeight : '0',
              flex: '1 1 auto',
              overflow: 'auto',
            },
            className: `${prefix}-util-panel`,
          },
          {
            composition: {
              type: 'layout_parametric_stack',
              direction: 'row',
              items: ['Footer'],
            },
            style: {
              height: footerHeight,
              position: footerPosition,
              bottom: '0',
              left: '0',
              right: '0',
              zIndex: '1000',
            },
            className: `${prefix}-util-panel`,
          },
        ],
      },
      behaviors: [],
    };
  },
};

