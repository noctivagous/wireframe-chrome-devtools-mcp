/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../../third_party/index.js';
import {lengthSchema, normalizeLength} from './utils.js';

export const centeredHeroRecipe: {
  name: 'centered_hero';
  description: string;
  schema: zod.ZodTypeAny;
  execute: (params: any, prefix: string) => {composition: any; behaviors: any[]};
} = {
  name: 'centered_hero' as const,
  description: 'Centered content layout with optional hero section at top.',
  schema: zod.object({
    heroHeight: lengthSchema.optional(),
    maxContentWidth: lengthSchema.optional(),
    showHero: zod.coerce.boolean().optional(),
    contentPadding: lengthSchema.optional(),
  }),
  execute: (params: zod.infer<typeof centeredHeroRecipe.schema>, prefix: string) => {
    const heroHeight = normalizeLength(params.heroHeight) ?? '400px';
    const maxContentWidth = normalizeLength(params.maxContentWidth) ?? '1200px';
    const showHero = params.showHero ?? true;
    const contentPadding = normalizeLength(params.contentPadding) ?? '24px';

    const items: any[] = [];
    if (showHero) {
      items.push({
        composition: {
          type: 'layout_parametric_stack',
          direction: 'row',
          items: ['Hero'],
        },
        style: {height: heroHeight},
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
        maxWidth: maxContentWidth,
        margin: '0 auto',
        padding: contentPadding,
        flex: '1 1 auto',
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

