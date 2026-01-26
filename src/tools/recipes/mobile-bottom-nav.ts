/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {lengthSchema, normalizeLength} from './utils.js';

export const mobileBottomNavRecipe: {
  name: 'mobile_bottom_nav';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'mobile_bottom_nav' as const,
  description: 'Mobile-style layout with bottom navigation bar.',
  schema: zod.object({
    navHeight: lengthSchema.optional(),
    navItems: zod.array(zod.string()).optional(),
    showTopBar: zod.coerce.boolean().optional(),
    topBarHeight: lengthSchema.optional(),
  }),
  execute: (params: zod.infer<typeof mobileBottomNavRecipe.schema>, prefix: string) => {
    const navHeight = normalizeLength(params.navHeight) ?? '56px';
    const navItems = params.navItems ?? ['Home', 'Search', 'Profile'];
    const showTopBar = params.showTopBar ?? true;
    const topBarHeight = normalizeLength(params.topBarHeight) ?? '56px';
    const contentHeight = showTopBar
      ? `calc(100vh - ${topBarHeight} - ${navHeight})`
      : `calc(100vh - ${navHeight})`;

    const items: any[] = [];
    if (showTopBar) {
      items.push({
        composition: {
          type: 'layout_parametric_stack',
          direction: 'row',
          items: ['Top Bar'],
        },
        style: {
          height: topBarHeight,
          position: 'sticky',
          top: '0',
          zIndex: '1000',
        },
        className: `${prefix}-util-panel`,
      });
    }
    items.push({
      composition: {
        type: 'layout_parametric_stack',
        direction: 'column',
        items: ['Content'],
      },
      style: {
        minHeight: contentHeight,
        paddingBottom: navHeight,
        flex: '1 1 auto',
        overflow: 'auto',
      },
      className: `${prefix}-util-panel`,
    });
    items.push({
      composition: {
        type: 'layout_parametric_stack',
        direction: 'row',
        items: navItems.map((item: string, idx: number) => ({
          composition: {
            type: 'layout_parametric_stack',
            direction: 'column',
            items: [item],
          },
          style: {flex: '1 1 auto'},
          className: `${prefix}-util-panel`,
        })),
      },
      style: {
        height: navHeight,
        position: 'fixed',
        bottom: '0',
        left: '0',
        right: '0',
        zIndex: '1000',
      },
      className: `${prefix}-util-panel`,
    });

    return {
      composition: {
        type: 'layout_parametric_stack',
        direction: 'column',
        items,
      },
      behaviors: [],
    };
  },
};

