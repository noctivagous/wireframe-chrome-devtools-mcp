/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';

// Schema for content that can be either a string or a selector object
const contentSchema = zod.union([
  zod.string().describe('Static HTML string content.'),
  zod.object({
    selector: zod.string().describe('CSS selector to move existing DOM element into this panel.'),
    preserveEvents: zod.boolean().optional().default(true).describe('Whether to preserve event listeners when moving (default: true).'),
    hideOriginal: zod.boolean().optional().default(true).describe('Whether to hide the original element after moving (default: true).'),
  }).describe('Selector object to migrate existing DOM content.'),
]);

export const selectableViewRecipe: {
  name: 'selectable_view';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]; contentMigration?: any[]};
} = {
  name: 'selectable_view' as const,
  description: 'Generic selectable view (tabs/carousel-like) with accessibility behaviors. Supports both static HTML content and DOM element migration via selectors.',
  schema: zod.object({
    labels: zod.array(zod.string()).min(1),
    contents: zod.array(contentSchema).min(1),
    orientation: zod.enum(['horizontal', 'vertical']).optional(),
    variant: zod.enum(['tabs', 'carousel']).optional(),
    showControls: zod.coerce.boolean().optional(),
    showIndicators: zod.coerce.boolean().optional(),
  }).refine(
    (data) => data.labels.length === data.contents.length,
    { message: 'labels and contents arrays must have the same length' }
  ),
  execute: (params: zod.infer<typeof selectableViewRecipe.schema>, prefix: string) => {
    // Separate content migration info from static content
    const contentMigration: Array<{panelIndex: number; selector: string; preserveEvents: boolean; hideOriginal: boolean}> = [];
    const items = params.labels.map((label: string, index: number) => {
      const content = params.contents[index];
      if (typeof content === 'string') {
        return {
          label,
          content,
        };
      } else {
        // This is a selector object - store migration info and use placeholder
        contentMigration.push({
          panelIndex: index,
          selector: content.selector,
          preserveEvents: content.preserveEvents ?? true,
          hideOriginal: content.hideOriginal ?? true,
        });
        return {
          label,
          content: '', // Placeholder - will be replaced during migration
        };
      }
    });

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
      contentMigration: contentMigration.length > 0 ? contentMigration : undefined,
    };
  },
};

