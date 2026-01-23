/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const installExtension = defineTool({
  name: 'install_extension',
  description: 'Installs a Chrome extension from the given path.',
  annotations: {
    category: ToolCategory.EXTENSIONS,
    readOnlyHint: false,
    isOriginal: false,
  },
  schema: {
    path: zod
      .string()
      .describe('Absolute path to the unpacked extension folder.'),
  },
  handler: async (request, response, context) => {
    const {path} = request.params;
    const id = await context.installExtension(path);
    response.appendResponseLine(`Extension installed. Id: ${id}`);
  },
});

export const uninstallExtension = defineTool({
  name: 'uninstall_extension',
  description: 'Uninstalls a Chrome extension by extension ID.',
  annotations: {
    category: ToolCategory.EXTENSIONS,
    readOnlyHint: false,
    isOriginal: false,
  },
  schema: {
    id: zod.string().describe('Extension ID to uninstall.'),
  },
  handler: async (request, response, context) => {
    const {id} = request.params;
    await context.uninstallExtension(id);
    response.appendResponseLine(`Extension uninstalled. Id: ${id}`);
  },
});

export const reloadExtension = defineTool({
  name: 'reload_extension',
  description: 'Reloads a Chrome extension by extension ID.',
  annotations: {
    category: ToolCategory.EXTENSIONS,
    readOnlyHint: false,
    isOriginal: false,
  },
  schema: {
    id: zod.string().describe('Extension ID to reload.'),
  },
  handler: async (request, response, context) => {
    const {id} = request.params;
    await context.reloadExtension(id);
    response.appendResponseLine(`Extension reloaded. Id: ${id}`);
  },
});

export const reinstallExtension = defineTool({
  name: 'reinstall_extension',
  description: 'Uninstalls and reinstalls a Chrome extension from a path.',
  annotations: {
    category: ToolCategory.EXTENSIONS,
    readOnlyHint: false,
    isOriginal: false,
  },
  schema: {
    id: zod.string().describe('Extension ID to reinstall.'),
    path: zod
      .string()
      .describe('Absolute path to the unpacked extension folder.'),
  },
  handler: async (request, response, context) => {
    const {id, path} = request.params;
    const newId = await context.reinstallExtension(id, path);
    response.appendResponseLine(`Extension reinstalled. Id: ${newId}`);
  },
});
