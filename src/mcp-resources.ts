/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {load as yamlLoad} from 'js-yaml';

import type {McpServer} from './third_party/index.js';

/**
 * Project documentation and workflow guidance exposed as MCP Resources + Prompts.
 *
 * Why:
 * - Resources are ideal for static/semi-static docs like README/USAGE_GUIDE.
 * - Prompts provide reusable workflow templates aligned with USAGE_GUIDE.md.
 */

interface ResourceDefinition {
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  filePath: string;
}

interface PromptDefinition {
  name: string;
  title: string;
  description: string;
  text: string;
}

interface McpConfig {
  resources: ResourceDefinition[];
  prompts: PromptDefinition[];
}

/**
 * Get the directory containing this source file.
 */
function getSourceDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

/**
 * Register all MCP resources (project documentation).
 * Loads resource definitions from mcp-prompts.yaml.
 */
export function registerResources(server: McpServer, projectRoot: string): void {
  const sourceDir = getSourceDir();
  const configFilePath = path.join(sourceDir, 'mcp-prompts.yaml');
  const configData = yamlLoad(
    fs.readFileSync(configFilePath, 'utf8'),
  ) as McpConfig;

  if (!configData.resources || configData.resources.length === 0) {
    return;
  }

  for (const r of configData.resources) {
    const fullFilePath = path.join(projectRoot, r.filePath);
    server.registerResource(
      r.name,
      r.uri,
      {
        title: r.name,
        description: r.description,
        mimeType: r.mimeType,
      },
      async () => {
        const text = await fs.promises.readFile(fullFilePath, 'utf8');
        return {
          contents: [
            {
              uri: r.uri,
              mimeType: r.mimeType,
              text,
            },
          ],
        };
      },
    );
  }
}

/**
 * Register all MCP prompts (workflow templates).
 * Loads prompt definitions from mcp-prompts.yaml.
 */
export function registerPrompts(server: McpServer): void {
  const sourceDir = getSourceDir();
  const configFilePath = path.join(sourceDir, 'mcp-prompts.yaml');
  const configData = yamlLoad(
    fs.readFileSync(configFilePath, 'utf8'),
  ) as McpConfig;

  if (!configData.prompts || configData.prompts.length === 0) {
    return;
  }

  for (const prompt of configData.prompts) {
    server.registerPrompt(
      prompt.name,
      {
        title: prompt.title,
        description: prompt.description,
      },
      () => ({
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: prompt.text,
            },
          },
        ],
      }),
    );
  }
}

