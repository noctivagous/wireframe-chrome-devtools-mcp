/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';

export const selectableViewRecipe: {
  name: 'selectable_view';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'selectable_view' as const,
  description: 'Generic selectable view (tabs/carousel-like) with accessibility behaviors.',
  schema: zod.object({
    items: zod
      .array(
        zod.object({
          label: zod.string(),
          content: zod.string(),
        }),
      )
      .min(1),
    orientation: zod.enum(['horizontal', 'vertical']).optional(),
    variant: zod.enum(['tabs', 'carousel']).optional(),
    showControls: zod.coerce.boolean().optional(),
    showIndicators: zod.coerce.boolean().optional(),
  }),
  execute: (params: zod.infer<typeof selectableViewRecipe.schema>, prefix: string) => {
    return {
      composition: {
        type: 'component_parametric_viewer',
        items: params.items ?? [],
        orientation: params.orientation,
        variant: params.variant,
        showControls: params.showControls,
        showIndicators: params.showIndicators,
        behaviors: [],
      },
      behaviors: [
        {type: 'behavior_selectable', params: {multiSelect: false}},
        {
          type: 'behavior_roving_focus',
          params: {axis: params.orientation === 'vertical' ? 'y' : 'x'},
        },
        {type: 'behavior_aria_pattern', params: {pattern: 'tabs'}},
      ],
    };
  },
};

