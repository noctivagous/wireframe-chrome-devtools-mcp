/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {zod} from '../third_party/index.js';
import type {ConsoleMessageType} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';
type ConsoleResponseType = ConsoleMessageType | 'issue';

const FILTERABLE_MESSAGE_TYPES: [
  ConsoleResponseType,
  ...ConsoleResponseType[],
] = [
  'log',
  'debug',
  'info',
  'error',
  'warn',
  'dir',
  'dirxml',
  'table',
  'trace',
  'clear',
  'startGroup',
  'startGroupCollapsed',
  'endGroup',
  'assert',
  'profile',
  'profileEnd',
  'count',
  'timeEnd',
  'verbose',
  'issue',
];

export const listConsoleMessages = defineTool({
  name: 'list_console_messages',
  description:
    'List all console messages for the currently selected page since the last navigation.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    pageSize: zod
      .number()
      .int()
      .positive()
      .optional()
      .describe(
        'Maximum number of messages to return. When omitted, returns all requests.',
      ),
    pageIdx: zod
      .number()
      .int()
      .min(0)
      .optional()
      .describe(
        'Page number to return (0-based). When omitted, returns the first page.',
      ),
    types: zod
      .array(zod.enum(FILTERABLE_MESSAGE_TYPES))
      .optional()
      .describe(
        'Filter messages to only return messages of the specified resource types. When omitted or empty, returns all messages.',
      ),
    includePreservedMessages: zod
      .boolean()
      .default(false)
      .optional()
      .describe(
        'Set to true to return the preserved messages over the last 3 navigations.',
      ),
  },
  handler: async (request, response) => {
    response.setIncludeConsoleData(true, {
      pageSize: request.params.pageSize,
      pageIdx: request.params.pageIdx,
      types: request.params.types,
      includePreservedMessages: request.params.includePreservedMessages,
    });
  },
});

export const getConsoleMessage = defineTool({
  name: 'get_console_message',
  description: `Gets a console message by its ID. You can get all messages by calling ${listConsoleMessages.name}.`,
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    msgid: zod
      .number()
      .describe(
        'The msgid of a console message on the page from the listed console messages',
      ),
  },
  handler: async (request, response) => {
    response.attachConsoleMessage(request.params.msgid);
  },
});

export const jsConsole = defineTool({
  name: 'js_console',
  description: 'Enhanced interactive JavaScript environment with persistent sessions, multi-line script support, and context isolation for advanced debugging and development.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    script: zod
      .string()
      .describe(
        'The JavaScript code to execute. Supports multi-line scripts and maintains context across calls when persist is true.',
      ),
    persist: zod
      .boolean()
      .default(false)
      .describe(
        'Whether to maintain console session context across multiple calls. When true, variables and functions persist between executions.',
      ),
    context: zod
      .enum(['page', 'isolated'])
      .default('page')
      .describe(
        'Execution context: "page" executes in the page context, "isolated" executes in a clean environment without page variables.',
      ),
    returnResult: zod
      .boolean()
      .default(true)
      .describe(
        'Whether to return the result of the script execution. Set to false to execute code for side effects only.',
      ),
    sessionId: zod
      .string()
      .optional()
      .describe(
        'Optional session identifier. When provided with persist=true, maintains context for this specific session.',
      ),
  },
  handler: async (request, response, context) => {
    const { script, persist, context: execContext, returnResult, sessionId } = request.params;

    try {
      const page = context.getSelectedPage();

      // Generate or use session ID for persistent context
      const actualSessionId = sessionId || (persist ? `session_${Date.now()}` : undefined);

      if (persist && actualSessionId) {
        // For persistent sessions, we need to maintain state in the page context
        const runPersistent = async () =>
          page.evaluate(
            ({script, sessionId}) => {
              const root = window as any;
              if (!root.__jsConsoleSessions) {
                root.__jsConsoleSessions = {};
              }
              if (!root.__jsConsoleSessions[sessionId]) {
                root.__jsConsoleSessions[sessionId] = {};
              }
              const session = root.__jsConsoleSessions[sessionId];
              const fn = new Function(
                'session',
                `return (async () => { with (session) { ${script} } })()`,
              );
              return fn(session).catch((e: unknown) => ({
                error: e instanceof Error ? e.message : String(e),
                stack: e instanceof Error ? e.stack : undefined,
              }));
            },
            {script, sessionId: actualSessionId},
          );

        if (returnResult) {
          const result = (await runPersistent()) as { error?: string; stack?: string } | unknown;

          if (result && typeof result === 'object' && 'error' in result && result.error) {
            response.appendResponseLine('Script execution error:');
            response.appendResponseLine('```javascript');
            response.appendResponseLine(String(result.error));
            if ('stack' in result && result.stack) {
              response.appendResponseLine('\nStack trace:');
              response.appendResponseLine(String(result.stack));
            }
            response.appendResponseLine('```');
          } else {
            response.appendResponseLine('Script executed successfully:');
            response.appendResponseLine('```json');
            response.appendResponseLine(JSON.stringify(result, null, 2));
            response.appendResponseLine('```');
          }
        } else {
          await runPersistent();
          response.appendResponseLine('Script executed (no return value requested).');
        }

        if (persist) {
          response.appendResponseLine(`Session '${actualSessionId}' context preserved for future calls.`);
        }
      } else {
        // Non-persistent execution
        if (execContext === 'isolated') {
          // Execute in isolated context (clean environment)
          const runIsolated = async () =>
            page.evaluate(
              ({script}) => {
                const fn = new Function(`
                  const window = undefined;
                  const document = undefined;
                  const globalThis = undefined;
                  const self = undefined;
                  return (async () => { ${script} })();
                `);
                return fn().catch((e: unknown) => ({
                  error: e instanceof Error ? e.message : String(e),
                  stack: e instanceof Error ? e.stack : undefined,
                }));
              },
              {script},
            );

          if (returnResult) {
            const result = (await runIsolated()) as { error?: string; stack?: string } | unknown;

            if (result && typeof result === 'object' && 'error' in result && result.error) {
              response.appendResponseLine('Script execution error:');
              response.appendResponseLine('```javascript');
              response.appendResponseLine(String(result.error));
              if ('stack' in result && result.stack) {
                response.appendResponseLine('\nStack trace:');
                response.appendResponseLine(String(result.stack));
              }
              response.appendResponseLine('```');
            } else {
              response.appendResponseLine('Script executed successfully:');
              response.appendResponseLine('```json');
              response.appendResponseLine(JSON.stringify(result, null, 2));
              response.appendResponseLine('```');
            }
          } else {
            await runIsolated();
            response.appendResponseLine('Script executed (no return value requested).');
          }
        } else {
          // Execute in page context
          if (returnResult) {
            const result = await page.evaluate(`(async () => {
              try {
                ${script}
              } catch (e) {
                return { error: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined };
              }
            })()`) as { error?: string; stack?: string } | unknown;

            if (result && typeof result === 'object' && 'error' in result && result.error) {
              response.appendResponseLine('Script execution error:');
              response.appendResponseLine('```javascript');
              response.appendResponseLine(String(result.error));
              if ('stack' in result && result.stack) {
                response.appendResponseLine('\nStack trace:');
                response.appendResponseLine(String(result.stack));
              }
              response.appendResponseLine('```');
            } else {
              response.appendResponseLine('Script executed successfully:');
              response.appendResponseLine('```json');
              response.appendResponseLine(JSON.stringify(result, null, 2));
              response.appendResponseLine('```');
            }
          } else {
            await page.evaluate(script);
            response.appendResponseLine('Script executed (no return value requested).');
          }
        }
      }
    } catch (e) {
      const errorText = e instanceof Error ? e.message : JSON.stringify(e);
      response.appendResponseLine('An error occurred while executing the script:');
      response.appendResponseLine('```javascript');
      response.appendResponseLine(errorText);
      response.appendResponseLine('```');
    }
  },
});
