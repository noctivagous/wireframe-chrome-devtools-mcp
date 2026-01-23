/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {
  getDefaultGuidanceConfigPath,
  loadGuidanceConfig,
  saveGuidanceConfig,
} from '../guidance-config.js';
import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

const guideContentSchema = zod
  .object({
    design: zod
      .string()
      .optional()
      .describe('Markdown content for the design guide.'),
    architecture: zod
      .string()
      .optional()
      .describe('Markdown content for the architecture guide.'),
    engineering: zod
      .string()
      .optional()
      .describe('Markdown content for the engineering guide.'),
  })
  .describe('Updates to guidance content.');

export const guidanceConfig = defineTool({
  name: 'guidance_config',
  description:
    'Get or set the MCP guidance content (design/architecture/engineering) stored in the MCP server directory.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
    isOriginal: false,
  },
  schema: {
    get: zod
      .boolean()
      .default(true)
      .optional()
      .describe('If true, return the current guidance config.'),
    set: guideContentSchema
      .optional()
      .describe('Optional guidance updates to apply before returning.'),
  },
  handler: async (request, response) => {
    const configPath = getDefaultGuidanceConfigPath();
    const {config} = await loadGuidanceConfig(configPath);
    let nextConfig = config;
    let updated = false;

    if (request.params.set) {
      const set = request.params.set;
      const guides = {
        ...config.guides,
      };
      if (typeof set.design === 'string') {
        guides.design = {...guides.design, content: set.design};
      }
      if (typeof set.architecture === 'string') {
        guides.architecture = {...guides.architecture, content: set.architecture};
      }
      if (typeof set.engineering === 'string') {
        guides.engineering = {...guides.engineering, content: set.engineering};
      }
      nextConfig = await saveGuidanceConfig(configPath, {guides});
      updated = true;
    }

    const shouldReturn = request.params.get ?? true;
    if (shouldReturn) {
      response.appendResponseLine('Guidance config:');
      response.appendResponseLine('```json');
      response.appendResponseLine(JSON.stringify({...nextConfig, configPath}, null, 2));
      response.appendResponseLine('```');
      return;
    }

    response.appendResponseLine(
      updated ? `Guidance updated at ${nextConfig.updatedAt}.` : 'Guidance unchanged.',
    );
  },
});

