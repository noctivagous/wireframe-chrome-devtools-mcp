/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import type {McpContext} from '../McpContext.js';
import {McpResponse} from '../McpResponse.js';
import {zod} from '../third_party/index.js';


import {ToolCategory} from './categories.js';
import {defineTool, type ToolDefinition} from './ToolDefinition.js';

const MAX_BATCH_OPERATIONS = 50;
const DEFAULT_BATCH_TIMEOUT_MS = 5 * 60 * 1000;

interface ToolEntry {
  tool: ToolDefinition;
  enabled: boolean;
}

interface BatchOpsExecutor {
  getToolEntry(name: string): ToolEntry | undefined;
  createIsolatedContext(): Promise<McpContext>;
  experimentalStructuredContent: boolean;
}

let executor: BatchOpsExecutor | null = null;

export function setBatchOpsExecutor(nextExecutor: BatchOpsExecutor): void {
  executor = nextExecutor;
}

const OperationSchema = zod.object({
  tool: zod.string().min(1).describe('Tool name to execute'),
  params: zod
    .record(zod.unknown())
    .optional()
    .default({})
    .describe('Tool parameters'),
  id: zod
    .string()
    .optional()
    .describe('Optional operation ID for referencing results'),
});

export const batchOps = defineTool({
  name: 'batch_ops',
  description:
    'Execute multiple tool operations in a single call to reduce round-trips. ' +
    'Supports sequential execution in MVP. Returns structured results for observability.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    operations: zod
      .array(OperationSchema)
      .min(1)
      .max(MAX_BATCH_OPERATIONS)
      .describe('Array of operations to execute'),
    executionMode: zod
      .enum(['sequential', 'parallel'])
      .default('sequential')
      .describe(
        'Execution mode: sequential (default, preserves order) or parallel (future).',
      ),
    stopOnError: zod
      .boolean()
      .default(true)
      .describe('If true, stop execution on first error.'),
    continueOnError: zod
      .boolean()
      .optional()
      .describe('Alias for !stopOnError. If true, continue on errors.'),
    shareContext: zod
      .boolean()
      .default(true)
      .describe('If true, reuse a shared context instance across operations.'),
    aggregateResults: zod
      .boolean()
      .default(true)
      .describe('Legacy flag for compatibility. Structured results are always returned.'),
    lastResultOnly: zod
      .boolean()
      .default(false)
      .describe(
        'If true, include a compact lastResult field while still returning structured results.',
      ),
    timeoutMs: zod
      .number()
      .int()
      .min(1)
      .default(DEFAULT_BATCH_TIMEOUT_MS)
      .describe('Maximum total execution time for the batch in milliseconds.'),
  },
  handler: async (request, response, context) => {
    if (!executor) {
      throw new Error('batch_ops executor is not configured');
    }
    const batchExecutor = executor;

    const {
      operations,
      executionMode,
      continueOnError,
      shareContext,
      lastResultOnly,
      timeoutMs,
    } = request.params;
    const stopOnError =
      continueOnError === true ? false : request.params.stopOnError;

    if (executionMode === 'parallel') {
      throw new Error('batch_ops parallel execution is not implemented yet');
    }

    if (operations.length > MAX_BATCH_OPERATIONS) {
      throw new Error(
        `batch_ops supports up to ${MAX_BATCH_OPERATIONS} operations per batch`,
      );
    }

    const invalidTools = operations.filter(op => {
      if (op.tool === 'batch_ops') {
        return true;
      }
      const entry = batchExecutor.getToolEntry(op.tool);
      return !entry || !entry.enabled;
    });

    if (invalidTools.length > 0) {
      const names = invalidTools.map(op => op.tool).join(', ');
      throw new Error(`Invalid or disabled tools: ${names}`);
    }

    const startedAt = Date.now();
    const deadline = startedAt + timeoutMs;

    const ensureWithinTimeout = () => {
      if (Date.now() > deadline) {
        throw new Error(`batch_ops exceeded timeoutMs (${timeoutMs}ms)`);
      }
    };

    const results: Array<Record<string, unknown>> = [];

    const sharedContext = shareContext ? context : null;

    for (let index = 0; index < operations.length; index += 1) {
      ensureWithinTimeout();
      const operation = operations[index];
      const entry = batchExecutor.getToolEntry(operation.tool);
      if (!entry) {
        throw new Error(`Tool not registered: ${operation.tool}`);
      }

      const operationId = operation.id ?? operation.tool;
      try {
        const opContext = shareContext
          ? (sharedContext as McpContext)
          : await batchExecutor.createIsolatedContext();
        const opResponse = new McpResponse();

        await entry.tool.handler({params: operation.params ?? {}}, opResponse, opContext);
        const {content, structuredContent} = await opResponse.handle(
          entry.tool.name,
          opContext,
        );

        const result: Record<string, unknown> = {
          id: operationId,
          tool: entry.tool.name,
          index,
          success: true,
          result: content,
        };
        if (batchExecutor.experimentalStructuredContent) {
          result.structuredContent = structuredContent as Record<string, unknown>;
        }
        results.push(result);
      } catch (err) {
        const errorText =
          err && typeof err === 'object' && 'message' in err
            ? String(err.message)
            : String(err);
        results.push({
          id: operationId,
          tool: entry.tool.name,
          index,
          success: false,
          error: errorText,
        });

        if (stopOnError) {
          break;
        }
      }
    }

    const payload: Record<string, unknown> = {
      totalOperations: operations.length,
      executedOperations: results.length,
      results,
      summary: {
        successful: results.filter(r => r.success === true).length,
        failed: results.filter(r => r.success === false).length,
      },
    };

    if (lastResultOnly) {
      payload.lastResult = results[results.length - 1] ?? null;
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(JSON.stringify(payload, null, 2));
    response.appendResponseLine('```');
  },
});

