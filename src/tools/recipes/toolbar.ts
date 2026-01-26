/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {escapeHtml} from './utils.js';

export const toolbarRecipe: {
  name: 'toolbar';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'toolbar' as const,
  description: 'Generic toolbar with grouped buttons.',
  schema: zod.object({
    groups: zod
      .array(
        zod.object({
          label: zod.string().optional(),
          items: zod.array(zod.string()).min(1),
        }),
      )
      .min(1),
  }),
  execute: (params: zod.infer<typeof toolbarRecipe.schema>, prefix: string) => {
    const groups = Array.isArray(params.groups) ? params.groups : [];
    return {
      composition: {
        type: 'layout_parametric_stack',
        direction: 'row',
        items: groups.map((group: any) => ({
          composition: {
            type: 'layout_parametric_stack',
            direction: 'row',
            items: (group.items ?? []).map((label: string) => ({
              label,
              content: escapeHtml(label),
              className: `${prefix}-util-btn`,
            })),
          },
          className: `${prefix}-util-toolbar-group`,
        })),
      },
      behaviors: [],
    };
  },
};

