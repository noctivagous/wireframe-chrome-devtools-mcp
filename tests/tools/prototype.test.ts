/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import {describe, it} from 'node:test';

import {injectChatbox, insertCss, insertJs} from '../../src/tools/mutation.js';
import {exportPrototypeState} from '../../src/tools/prototype.js';
import {serverHooks} from '../server.js';
import {html, withMcpContext} from '../utils.js';

describe('prototype export', () => {
  const server = serverHooks();

  it('exports a single HTML prototype without the chatbox UI but with injected patches', async () => {
    await withMcpContext(async (response, context) => {
      const page = await context.newPage();
      await page.setContent(html`
        <div class="x">x</div>
      `);

      // Inject CSS + JS patches.
      await insertCss.handler(
        {params: {cssText: '.x { color: red; }', replaceExisting: false, patchId: 'p1'}},
        response,
        context,
      );
      await insertJs.handler(
        {params: {jsText: 'document.body.setAttribute("data-js","1")', replaceExisting: false, patchId: 'p2'}},
        response,
        context,
      );

      // Inject chatbox (should be excluded from export).
      await injectChatbox.handler(
        {
          params: {
            action: 'inject',
            patchId: 'chatbox-patch',
            replaceExisting: false,
            dock: 'right',
            width: 380,
            zIndex: 2147483647,
            title: 'Live Edit Session',
            placeholder: 'ignored',
            startOpen: true,
          },
        },
        response,
        context,
      );

      response.resetResponseLineForTesting();
      await exportPrototypeState.handler(
        {
          params: {
            mode: 'single_html',
            includeChatbox: false,
            baseName: 'prototype',
            includeExternal: true,
          },
        },
        response,
        context,
      );

      // Parse returned JSON for output file path.
      const jsonText = response.responseLines.join('\n');
      const m = jsonText.match(/```json\s*([\s\S]*?)\s*```/);
      assert.ok(m && m[1], 'expected JSON block in tool output');
      const out = JSON.parse(m[1]) as any;
      const htmlPath = out?.files?.html as string;
      assert.ok(htmlPath, 'expected files.html in output');

      const exported = await fs.readFile(htmlPath, 'utf8');
      assert.ok(!exported.includes('mcp-chatbox-root'), 'export should not include chatbox root');
      assert.ok(exported.includes('.x { color: red; }'), 'export should include injected CSS');
      assert.ok(exported.includes('data-js'), 'export should include injected JS');
    });
  });
});


