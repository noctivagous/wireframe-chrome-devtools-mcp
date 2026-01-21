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

import {applyUnifiedDiff, previewUnifiedDiffFromCommitPlan} from '../../src/tools/diff.js';

function makeResponseCollector() {
  const lines: string[] = [];
  return {
    lines,
    response: {
      appendResponseLine(line: string) {
        lines.push(line);
      },
      setIncludePages() {},
      setIncludeNetworkRequests() {},
      setIncludeConsoleData() {},
      includeSnapshot() {},
      attachImage() {},
      attachNetworkRequest() {},
      attachConsoleMessage() {},
      attachDevToolsData() {},
      setTabId() {},
    } as any,
  };
}

function extractJsonFromResponseLines(lines: string[]): any {
  const start = lines.indexOf('```json');
  const end = lines.lastIndexOf('```');
  if (start === -1 || end === -1 || end <= start) {
    throw new Error('Could not find JSON fence in response.');
  }
  const jsonText = lines.slice(start + 1, end).join('\n');
  return JSON.parse(jsonText);
}

describe('diff-plan', () => {
  it('generates a unified diff from a commit plan and applies it', async () => {
    const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-diff-plan-test-'));
    const rel = 'styles.css';
    const abs = path.join(rootDir, rel);
    await fs.writeFile(abs, '/* initial */\n', 'utf8');

    const appendText =
      '/* mcp-edit-session:edit_1 change:change_1 type:insert_css at:2026-01-20T00:00:00.000Z */\n' +
      '.x { color: red; }\n' +
      '/* end mcp-edit-session:edit_1 change:change_1 */\n';

    const plan = {
      kind: 'mcp_edit_session_commit_plan',
      generatedAt: Date.now(),
      sessionId: 'edit_1',
      plannedWrites: [
        {
          filePath: abs,
          appendChunks: 1,
          appendBytes: appendText.length,
          changeIds: ['change_1'],
        },
      ],
      _chunksByFile: {
        [abs]: [
          {
            changeId: 'change_1',
            type: 'insert_css',
            createdAt: Date.now(),
            marker: 'mcp-edit-session:edit_1 change:change_1',
            appendText,
          },
        ],
      },
    };

    // Generate diff from plan
    const {lines: previewLines, response: previewResp} = makeResponseCollector();
    await previewUnifiedDiffFromCommitPlan.handler(
      {params: {planJson: JSON.stringify(plan), rootDir, contextLines: 1, allowCreate: false, skipIfAlreadyApplied: true}},
      previewResp,
      {} as any,
    );
    const previewJson = extractJsonFromResponseLines(previewLines);
    assert.ok(typeof previewJson.diff === 'string' && previewJson.diff.includes(`+++ b/${rel}`));

    // Apply diff
    const {response: applyResp, lines: applyLines} = makeResponseCollector();
    await applyUnifiedDiff.handler(
      {params: {diff: previewJson.diff, rootDir, dryRun: false, allowCreate: false}},
      applyResp,
      {} as any,
    );
    const applyJson = extractJsonFromResponseLines(applyLines);
    assert.strictEqual(applyJson.filesPatched, 1);

    const updated = await fs.readFile(abs, 'utf8');
    assert.ok(updated.includes('.x { color: red; }'));
  });
});


