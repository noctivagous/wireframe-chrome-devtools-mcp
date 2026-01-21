/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

export const chatboxStep = defineTool({
  name: 'chatbox_step',
  description:
    'Drain pending user messages from the injected in-page chatbox (`inject_chatbox`) and append assistant replies back into the chat UI.\n\n' +
    '**Purpose:** This is a minimal bridge for chat-driven iteration without requiring any network wiring.\n' +
    'A higher-level agent can call this tool in a loop: user types → call `chatbox_step` → optionally call other tools → write results back.\n',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    patchId: zod
      .string()
      .optional()
      .describe(
        'Optional chatbox patchId to target. If omitted, uses `window.__MCP_CHATBOX__.patchId`.',
      ),
    maxMessages: zod
      .number()
      .int()
      .positive()
      .optional()
      .default(20)
      .describe('Maximum number of queued messages to drain in one call.'),
    respond: zod
      .boolean()
      .optional()
      .default(true)
      .describe('If true, append an assistant reply for each drained user message.'),
    responsePrefix: zod
      .string()
      .optional()
      .default('Ack:')
      .describe('Prefix for the default assistant reply.'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;

    // Note: when invoked directly (unit tests), zod defaults may not be applied.
    const maxMessages = request.params.maxMessages ?? 20;
    const respond = request.params.respond ?? true;
    const responsePrefix = request.params.responsePrefix ?? 'Ack:';
    const requestedPatchId = request.params.patchId;

    const result = await page.evaluate(
      ({maxMessages, respond, responsePrefix, patchId}) => {
        const w = window as any;
        const api = w.__MCP_CHATBOX__;
        if (!api || !api.inbox || !Array.isArray(api.inbox)) {
          return {
            ok: false,
            error: 'No chatbox inbox found. Did you run inject_chatbox on this page?',
            drained: [],
            replied: 0,
            usedPatchId: null,
          };
        }

        const usedPatchId = patchId ?? api.patchId ?? null;
        const drained = api.inbox.splice(0, Math.max(0, maxMessages));

        let replied = 0;
        if (respond && typeof api.appendAssistantMessage === 'function') {
          for (const msg of drained) {
            const text = msg && typeof msg.text === 'string' ? msg.text : '';
            api.appendAssistantMessage(`${responsePrefix} ${text}`);
            replied++;
          }
        }

        return {
          ok: true,
          drained,
          replied,
          usedPatchId,
        };
      },
      {maxMessages, respond, responsePrefix, patchId: requestedPatchId},
    );

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          pageId,
          ...result,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});


