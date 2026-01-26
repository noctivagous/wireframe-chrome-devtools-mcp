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
    labels: zod.array(zod.string()).min(1),
    contents: zod.array(zod.string()).min(1),
    orientation: zod.enum(['horizontal', 'vertical']).optional(),
    variant: zod.enum(['tabs', 'carousel']).optional(),
    showControls: zod.coerce.boolean().optional(),
    showIndicators: zod.coerce.boolean().optional(),
  }).refine(
    (data) => data.labels.length === data.contents.length,
    { message: 'labels and contents arrays must have the same length' }
  ),
  execute: (params: zod.infer<typeof selectableViewRecipe.schema>, prefix: string) => {
    // Reconstruct items array from flattened structure
    const items = params.labels.map((label: string, index: number) => ({
      label,
      content: params.contents[index] ?? '',
    }));

    return {
      composition: {
        type: 'component_parametric_viewer',
        items,
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

