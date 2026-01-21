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

import {applyUnifiedDiff} from '../../src/tools/diff.js';

describe('diff', () => {
  it('applies a unified diff to a file', async () => {
    const responseLines: string[] = [];
    const response = {
      appendResponseLine(line: string) {
        responseLines.push(line);
      },
      // Unused by this tool, but kept for shape compatibility if needed later.
      setIncludePages() {},
      setIncludeNetworkRequests() {},
      setIncludeConsoleData() {},
      includeSnapshot() {},
      attachImage() {},
      attachNetworkRequest() {},
      attachConsoleMessage() {},
      attachDevToolsData() {},
      setTabId() {},
    } as any;

    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-diff-test-'));
    const fileRel = 'hello.txt';
    const fileAbs = path.join(rootDir, fileRel);
    await fs.writeFile(fileAbs, 'hello\nworld\n', 'utf8');

    const diff = [
      `--- a/${fileRel}`,
      `+++ b/${fileRel}`,
      `@@ -1,2 +1,2 @@`,
      ` hello`,
      `-world`,
      `+there`,
      ``,
    ].join('\n');

    await applyUnifiedDiff.handler(
      {params: {diff, rootDir, dryRun: false, allowCreate: false}},
      response,
      // Tool doesn't require Context.
      {} as any,
    );

    const updated = await fs.readFile(fileAbs, 'utf8');
    assert.strictEqual(updated, 'hello\nthere\n');
    assert.ok(responseLines.join('\n').includes('"filesPatched": 1'));
  });
});


