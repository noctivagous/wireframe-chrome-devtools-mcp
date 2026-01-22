/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';

import {zod} from '../third_party/index.js';
import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';

type HunkLine =
  | {kind: 'context'; text: string}
  | {kind: 'remove'; text: string}
  | {kind: 'add'; text: string};

type Hunk = {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: HunkLine[];
};

type FilePatch = {
  filePath: string;
  hunks: Hunk[];
  isNewFile: boolean;
};

function isPathWithinRoot(rootDir: string, filePath: string): boolean {
  const root = path.resolve(rootDir);
  const abs = path.resolve(filePath);
  const rel = path.relative(root, abs);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + path.sep);
}

function parseHunkHeader(line: string): {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
} {
  // @@ -l,s +l,s @@ optional heading
  const m = line.match(/^@@\s+-(\d+)(?:,(\d+))?\s+\+(\d+)(?:,(\d+))?\s+@@/);
  if (!m) {
    throw new Error(`Invalid hunk header: ${line}`);
  }
  return {
    oldStart: Number(m[1]),
    oldCount: m[2] ? Number(m[2]) : 1,
    newStart: Number(m[3]),
    newCount: m[4] ? Number(m[4]) : 1,
  };
}

function normalizeDiffPath(p: string): string {
  // Common prefixes: a/ b/
  if (p.startsWith('a/')) return p.slice(2);
  if (p.startsWith('b/')) return p.slice(2);
  return p;
}

function parseUnifiedDiff(diffText: string): FilePatch[] {
  const lines = diffText.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  const patches: FilePatch[] = [];

  let i = 0;
  let cur: FilePatch | null = null;

  function flush() {
    if (cur) patches.push(cur);
    cur = null;
  }

  while (i < lines.length) {
    const line = lines[i] ?? '';

    // File boundary via git header
    if (line.startsWith('diff --git ')) {
      flush();
      i++;
      continue;
    }

    if (line.startsWith('--- ')) {
      // Old file path line. Example: --- a/foo.txt OR --- /dev/null
      const oldPathRaw = line.slice(4).trim().split(/\s+/)[0] ?? '';
      const oldPath = normalizeDiffPath(oldPathRaw);
      const isNewFile = oldPathRaw === '/dev/null';
      const next = lines[i + 1] ?? '';
      if (!next.startsWith('+++ ')) {
        throw new Error(`Expected '+++ ' after '--- ': got ${next}`);
      }
      const newPathRaw = next.slice(4).trim().split(/\s+/)[0] ?? '';
      if (newPathRaw === '/dev/null') {
        throw new Error('File deletion diffs are not supported.');
      }
      const newPath = normalizeDiffPath(newPathRaw);

      cur = {filePath: newPath, hunks: [], isNewFile};
      i += 2;
      continue;
    }

    if (line.startsWith('@@ ')) {
      if (!cur) {
        throw new Error(`Hunk found before file header: ${line}`);
      }
      const header = parseHunkHeader(line);
      const hunk: Hunk = {...header, lines: []};
      i++;
      while (i < lines.length) {
        const hl = lines[i] ?? '';
        if (hl.startsWith('@@ ')) break;
        if (hl.startsWith('--- ') || hl.startsWith('diff --git ')) break;
        if (hl.startsWith('\\ No newline at end of file')) {
          i++;
          continue;
        }
        const prefix = hl[0];
        const text = hl.slice(1);
        if (prefix === ' ') hunk.lines.push({kind: 'context', text});
        else if (prefix === '-') hunk.lines.push({kind: 'remove', text});
        else if (prefix === '+') hunk.lines.push({kind: 'add', text});
        else if (hl === '') {
          // This happens for empty last line in diff; treat as context with empty string
          // only if it was explicitly prefixed (which it isn't). Ignore.
        } else {
          throw new Error(`Unexpected diff line: ${hl}`);
        }
        i++;
      }
      cur.hunks.push(hunk);
      continue;
    }

    i++;
  }

  flush();
  return patches.filter(p => p.hunks.length > 0);
}

function applyPatchToText(
  original: string,
  patch: FilePatch,
): {next: string; rejectedHunks: Array<{hunk: Hunk; reason: string}>} {
  const srcLines = original.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n');
  // Preserve trailing newline behavior: split() produces [''] for empty string; ok.
  let out = srcLines.slice();

  const rejectedHunks: Array<{hunk: Hunk; reason: string}> = [];

  // Apply hunks sequentially (line-based), using oldStart as the primary anchor.
  // If mismatch occurs, reject the hunk; do not attempt fuzzy matching.
  let lineOffset = 0;
  for (const hunk of patch.hunks) {
    let idx = (hunk.oldStart - 1) + lineOffset;
    if (idx < 0) idx = 0;
    if (idx > out.length) idx = out.length;

    const before = out.slice(0, idx);
    const after = out.slice(idx);
    const working: string[] = [];

    let cursor = 0; // into `after`
    let ok = true;
    let reason = '';

    for (const hl of hunk.lines) {
      if (hl.kind === 'add') {
        working.push(hl.text);
        continue;
      }
      const existing = after[cursor];
      if (existing === undefined) {
        ok = false;
        reason = `Hunk expected line '${hl.text}' but reached EOF.`;
        break;
      }
      if (existing !== hl.text) {
        ok = false;
        reason = `Hunk mismatch. Expected '${hl.text}' but found '${existing}'.`;
        break;
      }
      if (hl.kind === 'context') {
        working.push(existing);
      }
      // remove: skip copying
      cursor++;
    }

    if (!ok) {
      rejectedHunks.push({hunk, reason});
      continue;
    }

    const consumed = cursor;
    const remaining = after.slice(consumed);
    const next = before.concat(working, remaining);

    // Update offset: oldCount lines replaced by newCount, but we can compute from actual operations.
    const removedCount = hunk.lines.filter(l => l.kind !== 'add').length;
    const addedCount = hunk.lines.filter(l => l.kind !== 'remove' && l.kind !== 'context').length;
    // More robust: compute net change from line kinds.
    const net =
      hunk.lines.reduce((n, l) => n + (l.kind === 'add' ? 1 : l.kind === 'remove' ? -1 : 0), 0);
    void removedCount;
    void addedCount;
    lineOffset += net;

    out = next;
  }

  return {next: out.join('\n'), rejectedHunks};
}

export const applyUnifiedDiff = defineTool({
  name: 'apply_unified_diff',
  description:
    'Apply a unified diff (git-style) to local files with strict conflict detection.\n\n' +
    'This is a Level A building block: apply small, reviewable diffs to the repo after validating changes in-browser.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    diff: zod.string().describe('Unified diff text to apply.'),
    rootDir: zod
      .string()
      .optional()
      .describe(
        'Safety root directory. All patches must target files within this directory. Defaults to the server process working directory.',
      ),
    dryRun: zod
      .boolean()
      .optional()
      .default(false)
      .describe('If true, do not write files; only report what would change.'),
    allowCreate: zod
      .boolean()
      .optional()
      .default(false)
      .describe('If true, allow creating new files when the diff targets /dev/null → new file.'),
  },
  handler: async (request, response) => {
    const rootDir = path.resolve(request.params.rootDir ?? process.cwd());
    const patches = parseUnifiedDiff(request.params.diff);

    const applied: Array<{filePath: string; hunks: number}> = [];
    const rejected: Array<{filePath: string; reason: string; rejectedHunks?: any[]}> = [];

    for (const p of patches) {
      const abs = path.resolve(rootDir, p.filePath);
      if (!isPathWithinRoot(rootDir, abs)) {
        rejected.push({filePath: abs, reason: `Refusing to patch outside rootDir (${rootDir}).`});
        continue;
      }

      let original = '';
      let exists = true;
      try {
        original = await fs.readFile(abs, 'utf8');
      } catch {
        exists = false;
        original = '';
      }

      if (!exists && p.isNewFile && !request.params.allowCreate) {
        rejected.push({
          filePath: abs,
          reason: 'Diff would create a new file; set allowCreate=true to permit.',
        });
        continue;
      }
      if (!exists && !p.isNewFile) {
        rejected.push({filePath: abs, reason: 'Target file does not exist.'});
        continue;
      }

      const {next, rejectedHunks} = applyPatchToText(original, p);
      if (rejectedHunks.length) {
        rejected.push({
          filePath: abs,
          reason: 'One or more hunks failed to apply cleanly.',
          rejectedHunks: rejectedHunks.map(r => ({
            header: `@@ -${r.hunk.oldStart},${r.hunk.oldCount} +${r.hunk.newStart},${r.hunk.newCount} @@`,
            reason: r.reason,
          })),
        });
        continue;
      }

      if (!request.params.dryRun) {
        await fs.mkdir(path.dirname(abs), {recursive: true});
        await fs.writeFile(abs, next, 'utf8');
      }
      applied.push({filePath: abs, hunks: p.hunks.length});
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          rootDir,
          dryRun: request.params.dryRun,
          filesPatched: applied.length,
          applied,
          rejected,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});

type CommitPlanChunkLike = {
  appendText: string;
  marker?: string;
};

type CommitPlanLike = {
  kind?: string;
  plannedWrites?: Array<{filePath: string}>;
  _chunksByFile?: Record<string, CommitPlanChunkLike[]>;
};

function splitLinesPreserveEmpty(text: string): string[] {
  const normalized = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
  const parts = normalized.split('\n');
  // Drop trailing empty produced by ending newline for diff calculations.
  if (parts.length > 0 && parts[parts.length - 1] === '') {
    return parts.slice(0, -1);
  }
  return parts;
}

function toUnifiedDiffForAppend(options: {
  relPath: string;
  originalText: string;
  appendedLines: string[];
  contextLines: number;
  isNewFile: boolean;
}): string {
  const rel = options.relPath.replaceAll('\\', '/');
  const originalLines = splitLinesPreserveEmpty(options.originalText);
  const ctxN = Math.max(0, Math.min(options.contextLines, originalLines.length));
  const ctx = ctxN > 0 ? originalLines.slice(originalLines.length - ctxN) : [];

  const oldStart =
    ctxN > 0 ? originalLines.length - ctxN + 1 : originalLines.length + 1;
  const oldCount = ctxN;
  const newStart = oldStart;
  const newCount = ctxN + options.appendedLines.length;

  const header = options.isNewFile
    ? [`--- /dev/null`, `+++ b/${rel}`]
    : [`--- a/${rel}`, `+++ b/${rel}`];
  const hunkHeader = `@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`;
  const body: string[] = [];
  for (const line of ctx) {
    body.push(` ${line}`);
  }
  for (const line of options.appendedLines) {
    body.push(`+${line}`);
  }
  return [...header, hunkHeader, ...body, ''].join('\n');
}

export const previewUnifiedDiffFromCommitPlan = defineTool({
  name: 'preview_diff_from_commit_plan',
  description:
    'Generate a unified diff (git-style) from a commit plan (typically produced by preview_commit_plan).\n\n' +
    'This lets Level A workflows produce reviewable diffs: plan → diff → apply_unified_diff (or git apply).',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: true,
  },
  schema: {
    planJson: zod
      .string()
      .describe(
        'Commit plan JSON (from preview_commit_plan with includeChunkContents=true).',
      ),
    rootDir: zod
      .string()
      .optional()
      .describe(
        'Safety root directory used to compute relative paths and constrain file reads. Defaults to the server process working directory.',
      ),
    contextLines: zod
      .number()
      .int()
      .min(0)
      .max(50)
      .optional()
      .default(3)
      .describe(
        'Number of trailing context lines to include per file for stricter patching.',
      ),
    skipIfAlreadyApplied: zod
      .boolean()
      .optional()
      .default(true)
      .describe(
        'If true, skips chunks whose marker text already exists in the target file (best-effort).',
      ),
    allowCreate: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, allow generating diffs that create new files when targets do not exist.',
      ),
  },
  handler: async (request, response) => {
    let plan: CommitPlanLike;
    try {
      plan = JSON.parse(request.params.planJson) as CommitPlanLike;
    } catch (e) {
      throw new Error(`Invalid planJson: ${(e as Error).message ?? String(e)}`);
    }
    if (!plan || typeof plan !== 'object') {
      throw new Error('Invalid planJson: expected an object');
    }
    if (plan.kind !== 'mcp_edit_session_commit_plan') {
      throw new Error('Invalid planJson: expected kind "mcp_edit_session_commit_plan"');
    }
    if (!plan._chunksByFile || typeof plan._chunksByFile !== 'object') {
      throw new Error(
        'Invalid planJson: missing plan._chunksByFile. Re-run preview_commit_plan with includeChunkContents=true.',
      );
    }

    const rootDir = path.resolve(request.params.rootDir ?? process.cwd());
    const plannedWrites = Array.isArray(plan.plannedWrites) ? plan.plannedWrites : [];

    const rejected: Array<{filePath: string; reason: string}> = [];
    const generated: Array<{filePath: string; relPath: string; addedLines: number}> = [];
    const diffs: string[] = [];

    for (const w of plannedWrites) {
      const plannedPath = typeof w?.filePath === 'string' ? w.filePath : '';
      if (!plannedPath) continue;

      // The plan may store absolute paths. Resolve and enforce root.
      const abs = path.resolve(plannedPath);
      if (!isPathWithinRoot(rootDir, abs)) {
        rejected.push({filePath: abs, reason: `Refusing to read outside rootDir (${rootDir}).`});
        continue;
      }

      const relPath = path.relative(rootDir, abs).replaceAll('\\', '/');

      const chunks =
        plan._chunksByFile[plannedPath] ?? plan._chunksByFile[abs] ?? [];
      if (!Array.isArray(chunks) || chunks.length === 0) {
        continue;
      }

      let originalText = '';
      let exists = true;
      try {
        originalText = await fs.readFile(abs, 'utf8');
      } catch {
        exists = false;
        originalText = '';
      }

      if (!exists && !request.params.allowCreate) {
        rejected.push({
          filePath: abs,
          reason: 'Target file does not exist; set allowCreate=true to generate a new-file diff.',
        });
        continue;
      }

      const fileContentForMarker = request.params.skipIfAlreadyApplied ? originalText : '';
      const appendLines: string[] = [];
      for (const c of chunks) {
        const marker = typeof c.marker === 'string' ? c.marker : undefined;
        if (marker && request.params.skipIfAlreadyApplied && fileContentForMarker.includes(marker)) {
          continue;
        }
        appendLines.push(...splitLinesPreserveEmpty(c.appendText));
      }

      if (appendLines.length === 0) {
        continue;
      }

      diffs.push(
        toUnifiedDiffForAppend({
          relPath,
          originalText,
          appendedLines: appendLines,
          contextLines: request.params.contextLines,
          isNewFile: !exists,
        }),
      );
      generated.push({filePath: abs, relPath, addedLines: appendLines.length});
    }

    const diff = diffs.join('\n');
    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          rootDir,
          contextLines: request.params.contextLines,
          skipIfAlreadyApplied: request.params.skipIfAlreadyApplied,
          allowCreate: request.params.allowCreate,
          files: generated,
          rejected,
          diff,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});


