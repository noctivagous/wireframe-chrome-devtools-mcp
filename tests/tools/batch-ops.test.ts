/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import logger from 'debug';
import {Locator} from 'puppeteer';

import {McpContext} from '../../src/McpContext.js';
import {McpResponse} from '../../src/McpResponse.js';
import {batchOps, setBatchOpsExecutor} from '../../src/tools/batch-ops.js';
import {evaluateScript} from '../../src/tools/script.js';
import type {ToolDefinition} from '../../src/tools/ToolDefinition.js';
import {withMcpContext} from '../utils.js';

function parseBatchResponse(responseText: string) {
  const start = responseText.indexOf('```json');
  const end = responseText.lastIndexOf('```');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Missing JSON response payload');
  }
  const jsonText = responseText.slice(start + '```json'.length, end);
  return JSON.parse(jsonText.trim());
}

describe('batch_ops', () => {
  it('runs sequential operations and returns structured results', async () => {
    await withMcpContext(async (response, context) => {
      const scriptTool = evaluateScript as unknown as ToolDefinition;
      setBatchOpsExecutor({
        getToolEntry: name => {
          if (name === evaluateScript.name) {
            return {tool: scriptTool, enabled: true};
          }
          return undefined;
        },
        createIsolatedContext: async () => {
          const newContext = await McpContext.from(
            context.browser,
            logger('test'),
            {experimentalDevToolsDebugging: false},
            Locator,
          );
          await newContext.detectOpenDevToolsWindows();
          return newContext;
        },
        experimentalStructuredContent: false,
      });

      await batchOps.handler(
        {
          params: {
            operations: [
              {tool: 'evaluate_script', params: {function: '() => 1'}, id: 'op1'},
              {tool: 'evaluate_script', params: {function: '() => "two"'}, id: 'op2'},
            ],
            executionMode: 'sequential',
            stopOnError: true,
            shareContext: true,
            aggregateResults: true,
            lastResultOnly: false,
            timeoutMs: 10000,
          },
        },
        response,
        context,
      );

      const payload = parseBatchResponse(response.responseLines.join('\n'));
      assert.strictEqual(payload.totalOperations, 2);
      assert.strictEqual(payload.executedOperations, 2);
      assert.strictEqual(payload.summary.successful, 2);
      assert.strictEqual(payload.summary.failed, 0);
      assert.strictEqual(payload.results.length, 2);
      assert.strictEqual(payload.results[0].id, 'op1');
      assert.strictEqual(payload.results[0].success, true);
      assert.strictEqual(payload.results[1].id, 'op2');
      assert.strictEqual(payload.results[1].success, true);
    });
  });

  it('stops on error by default and continues when continueOnError is true', async () => {
    await withMcpContext(async (response, context) => {
      const scriptTool = evaluateScript as unknown as ToolDefinition;
      setBatchOpsExecutor({
        getToolEntry: name => {
          if (name === evaluateScript.name) {
            return {tool: scriptTool, enabled: true};
          }
          return undefined;
        },
        createIsolatedContext: async () => {
          const newContext = await McpContext.from(
            context.browser,
            logger('test'),
            {experimentalDevToolsDebugging: false},
            Locator,
          );
          await newContext.detectOpenDevToolsWindows();
          return newContext;
        },
        experimentalStructuredContent: false,
      });

      await batchOps.handler(
        {
          params: {
            operations: [
              {tool: 'evaluate_script', params: {function: '() => 1'}, id: 'ok'},
              {tool: 'evaluate_script', params: {function: '() => { throw new Error("boom"); }'}, id: 'fail'},
              {tool: 'evaluate_script', params: {function: '() => 3'}, id: 'after'},
            ],
            executionMode: 'sequential',
            stopOnError: true,
            shareContext: true,
            aggregateResults: true,
            lastResultOnly: false,
            timeoutMs: 10000,
          },
        },
        response,
        context,
      );

      const stoppedPayload = parseBatchResponse(response.responseLines.join('\n'));
      assert.strictEqual(stoppedPayload.executedOperations, 2);
      assert.strictEqual(stoppedPayload.results.length, 2);
      assert.strictEqual(stoppedPayload.results[1].success, false);
      assert.match(String(stoppedPayload.results[1].error), /boom/);

      const secondResponse = new McpResponse();

      await batchOps.handler(
        {
          params: {
            operations: [
              {tool: 'evaluate_script', params: {function: '() => 1'}, id: 'ok'},
              {tool: 'evaluate_script', params: {function: '() => { throw new Error("boom"); }'}, id: 'fail'},
              {tool: 'evaluate_script', params: {function: '() => 3'}, id: 'after'},
            ],
            executionMode: 'sequential',
            stopOnError: true,
            shareContext: true,
            aggregateResults: true,
            lastResultOnly: false,
            timeoutMs: 10000,
            continueOnError: true,
          },
        },
        secondResponse,
        context,
      );

      const continuedPayload = parseBatchResponse(
        secondResponse.responseLines.join('\n'),
      );
      assert.strictEqual(continuedPayload.executedOperations, 3);
      assert.strictEqual(continuedPayload.results.length, 3);
      assert.strictEqual(continuedPayload.results[2].id, 'after');
      assert.strictEqual(continuedPayload.results[2].success, true);
    });
  });
});

