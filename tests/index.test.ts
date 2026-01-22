/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js';
import {executablePath} from 'puppeteer';

import {ToolCategory} from '../src/tools/categories.js';
import type {ToolDefinition} from '../src/tools/ToolDefinition';

describe('e2e', () => {
  async function withClient(
    cb: (client: Client) => Promise<void>,
    extraArgs: string[] = [],
  ) {
    const toolConfigPath = path.join(
      os.tmpdir(),
      `mcp-tools-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );
    const transport = new StdioClientTransport({
      command: 'node',
      args: [
        'build/src/index.js',
        '--headless',
        '--isolated',
        '--executable-path',
        executablePath(),
        '--tool-config',
        toolConfigPath,
        ...extraArgs,
      ],
    });
    const client = new Client(
      {
        name: 'e2e-test',
        version: '1.0.0',
      },
      {
        capabilities: {},
      },
    );

    try {
      await client.connect(transport);
      await cb(client);
    } finally {
      await client.close();
    }
  }
  it('calls a tool', async () => {
    await withClient(async client => {
      const result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      assert.deepStrictEqual(result, {
        content: [
          {
            type: 'text',
            text: '# list_pages response\n## Pages\n1: about:blank [selected]',
          },
        ],
      });
    });
  });

  it('calls a tool multiple times', async () => {
    await withClient(async client => {
      let result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      result = await client.callTool({
        name: 'list_pages',
        arguments: {},
      });
      assert.deepStrictEqual(result, {
        content: [
          {
            type: 'text',
            text: '# list_pages response\n## Pages\n1: about:blank [selected]',
          },
        ],
      });
    });
  });

  it('has all tools', async () => {
    await withClient(async client => {
      const {tools} = await client.listTools();
      const exposedNames = tools.map(t => t.name).sort();
      const {tools: allTools} = await import('../src/tools/tools.js');
      const definedNames = (allTools as ToolDefinition[])
        .filter(tool => {
          if (tool.annotations?.conditions?.includes('computerVision')) {
            return false;
          }
          if (tool.annotations?.conditions?.includes('experimentalInteropTools')) {
            return false;
          }
          if (tool.annotations?.category === ToolCategory.EXTENSIONS) {
            return false;
          }
          return true;
        })
        .map(tool => tool.name)
        .sort();
      assert.deepStrictEqual(exposedNames, definedNames);
    });
  });

  it('has experimental extensions tools', async () => {
    await withClient(
      async client => {
        const {tools} = await client.listTools();
        const install = tools.find(t => t.name === 'install_extension');
        const uninstall = tools.find(t => t.name === 'uninstall_extension');
        const reload = tools.find(t => t.name === 'reload_extension');
        const reinstall = tools.find(t => t.name === 'reinstall_extension');
        assert.ok(install);
        assert.ok(uninstall);
        assert.ok(reload);
        assert.ok(reinstall);
      },
      ['--category-extensions'],
    );
  });

  it('has experimental vision tools', async () => {
    await withClient(
      async client => {
        const {tools} = await client.listTools();
        const clickAt = tools.find(t => t.name === 'click_at');
        assert.ok(clickAt);
      },
      ['--experimental-vision'],
    );
  });

  it('has experimental interop tools', async () => {
    await withClient(
      async client => {
        const {tools} = await client.listTools();
        const getTabId = tools.find(t => t.name === 'get_tab_id');
        assert.ok(getTabId);
      },
      ['--experimental-interop-tools'],
    );
  });
});
