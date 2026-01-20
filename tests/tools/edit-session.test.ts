/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {describe, it} from 'node:test';

import {
  beginEditSession,
  commitEditSessionToFiles,
  getEditSession,
} from '../../src/tools/edit-session.js';
import {insertCss} from '../../src/tools/mutation.js';
import {withMcpContext} from '../utils.js';

describe('edit-session', () => {
  it('can begin and fetch an active edit session', async () => {
    await withMcpContext(async (response, context) => {
      await beginEditSession.handler({params: {label: 'test', setActive: true}}, response, context);
      const active = context.getActiveEditSessionId();
      assert.ok(active);

      await getEditSession.handler({params: {}}, response, context);
      const session = context.getEditSession(active);
      assert.strictEqual(session.label, 'test');
      assert.strictEqual(session.sessionId, active);
    });
  });

  it('records changes from insert_css and can commit them to a file', async () => {
    await withMcpContext(async (response, context) => {
      // Begin session
      await beginEditSession.handler({params: {label: 'commit test', setActive: true}}, response, context);
      const sessionId = context.getActiveEditSessionId();
      assert.ok(sessionId);

      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-edit-session-test-'));
      const targetFile = path.join(tmpDir, 'styles.css');
      await fs.writeFile(targetFile, '/* initial */\n', 'utf8');

      // Apply live change in Chromium and record it for later commit.
      const page = await context.newPage();
      await page.setContent('<div class="x">x</div>');
      await insertCss.handler(
        {
          params: {
            cssText: '.x { color: red; }',
            replaceExisting: false,
            recordToSession: true,
            targetFilePath: targetFile,
          },
        },
        response,
        context,
      );

      const session = context.getEditSession(sessionId!);
      assert.strictEqual(session.changes.length, 1);
      assert.strictEqual(session.changes[0].type, 'insert_css');

      // Dry-run first
      await commitEditSessionToFiles.handler(
        {params: {sessionId, dryRun: true}},
        response,
        context,
      );

      // Commit to disk
      await commitEditSessionToFiles.handler(
        {params: {sessionId, dryRun: false}},
        response,
        context,
      );

      const content = await fs.readFile(targetFile, 'utf8');
      assert.ok(content.includes('.x { color: red; }'));
      assert.ok(content.includes(`mcp-edit-session:${sessionId}`));
    });
  });
});


