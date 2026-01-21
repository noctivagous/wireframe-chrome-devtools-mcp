/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {zod} from '../third_party/index.js';

import {ToolCategory} from './categories.js';
import {defineTool} from './ToolDefinition.js';
import {captureWireframeSnapshot, renderSvgWireframe} from './wireframe.js';

function safeTimestampForFilename(ms: number): string {
  // Example: 2026-01-20T20-21-05Z
  const iso = new Date(ms).toISOString();
  return iso.replaceAll(':', '-').replaceAll('.', '-');
}

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, {recursive: true});
}

async function writeUtf8File(absPath: string, contents: string): Promise<void> {
  await ensureDir(path.dirname(absPath));
  await fs.writeFile(absPath, contents, 'utf8');
}

async function writeBytesFile(absPath: string, bytes: Uint8Array): Promise<void> {
  await ensureDir(path.dirname(absPath));
  await fs.writeFile(absPath, bytes);
}

export const captureEvidenceBundle = defineTool({
  name: 'capture_evidence_bundle',
  description:
    'Capture a small evidence bundle (wireframe JSON/SVG, text snapshot, optional screenshot) into a folder and optionally record the artifact paths into an edit session.\n\n' +
    'This is designed for Level 0/1 workflows: collect proof of what you changed in Chromium without committing anything to the repo.',
  annotations: {
    category: ToolCategory.SNAPSHOT,
    // Not read-only due to file writes.
    readOnlyHint: false,
  },
  schema: {
    outputDir: zod
      .string()
      .optional()
      .describe(
        'Optional output directory. If omitted, creates a temporary evidence directory under the OS temp folder.',
      ),
    baseName: zod
      .string()
      .optional()
      .describe(
        'Base filename prefix for artifacts. If omitted, a timestamped name is generated.',
      ),

    includeTextSnapshot: zod
      .boolean()
      .optional()
      .default(true)
      .describe('If true, capture the a11y-tree-based text snapshot (like take_snapshot).'),
    textSnapshotVerbose: zod
      .boolean()
      .optional()
      .default(false)
      .describe('If true, include the verbose text snapshot payload.'),

    includeWireframeJson: zod
      .boolean()
      .optional()
      .default(true)
      .describe('If true, capture a structured wireframe snapshot JSON (DOMSnapshot-based).'),
    includeWireframeSvg: zod
      .boolean()
      .optional()
      .default(true)
      .describe('If true, render and save an SVG wireframe snapshot.'),

    includeScreenshot: zod
      .boolean()
      .optional()
      .default(false)
      .describe('If true, capture a screenshot (slower, larger).'),
    screenshotFormat: zod
      .enum(['png', 'jpeg', 'webp'])
      .optional()
      .default('png')
      .describe('Screenshot format (when includeScreenshot=true).'),
    screenshotQuality: zod
      .number()
      .min(0)
      .max(100)
      .optional()
      .describe('Screenshot quality for jpeg/webp (ignored for png).'),
    screenshotFullPage: zod
      .boolean()
      .optional()
      .default(false)
      .describe('If true, capture a full-page screenshot (when includeScreenshot=true).'),

    // Wireframe scope (subset of wireframe_snapshot / svg_snapshot)
    selectors: zod
      .array(zod.string())
      .optional()
      .describe('Optional selectors to focus the wireframe capture on specific elements.'),
    scopeSelector: zod
      .string()
      .optional()
      .describe('Optional scope selector to constrain wireframe capture to a subtree.'),
    includeDescendants: zod
      .boolean()
      .optional()
      .default(false)
      .describe('When used with selectors, include descendants of matches in the wireframe capture.'),
    maxTotal: zod
      .number()
      .int()
      .positive()
      .optional()
      .default(80)
      .describe('Maximum number of elements to return in the wireframe snapshot (after filtering).'),
    includeComputedStyles: zod
      .boolean()
      .optional()
      .default(false)
      .describe('If true, include a computed-style whitelist for each element in the wireframe JSON.'),
    computedStylePreset: zod
      .enum(['minimal', 'layout', 'standard', 'debug', 'typography', 'paint'])
      .optional()
      .default('layout')
      .describe('Computed style preset used when includeComputedStyles=true.'),
    coordinateSpace: zod
      .enum(['viewport', 'document'])
      .optional()
      .default('viewport')
      .describe('Coordinate space for wireframe rects (viewport or document).'),

    // SVG rendering options (when includeWireframeSvg=true)
    svgBackground: zod
      .enum(['transparent', 'white', 'black'])
      .optional()
      .default('transparent')
      .describe('SVG background.'),
    svgScale: zod
      .number()
      .min(0.1)
      .max(4)
      .optional()
      .default(1)
      .describe('Scale factor for SVG output.'),
    svgShowLabels: zod
      .boolean()
      .optional()
      .default(true)
      .describe('If true, include element labels in the SVG.'),
    svgShowDimensions: zod
      .boolean()
      .optional()
      .default(false)
      .describe('If true, include element dimensions (W×H) in the SVG.'),
    svgShowSpacing: zod
      .boolean()
      .optional()
      .default(false)
      .describe('If true, render basic spacing annotations (heuristic).'),
    svgStrokeWidth: zod
      .number()
      .min(0.25)
      .max(8)
      .optional()
      .default(1)
      .describe('Stroke width for element rectangles in the SVG.'),
    svgFillOpacity: zod
      .number()
      .min(0)
      .max(1)
      .optional()
      .default(0.08)
      .describe('Fill opacity for element rectangles in the SVG.'),

    recordToSession: zod
      .boolean()
      .optional()
      .default(false)
      .describe(
        'If true, record this evidence bundle (paths + metadata) into an edit session journal.',
      ),
    editSessionId: zod
      .string()
      .optional()
      .describe(
        'Optional edit session id to record to. If omitted, uses the active session (or auto-creates one when recordToSession=true).',
      ),
    description: zod
      .string()
      .optional()
      .describe('Optional human description to store alongside the evidence bundle entry.'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;
    const capturedAt = Date.now();
    const url = page.url();
    const viewport = (await page.viewport()) ?? null;

    const outputDir = request.params.outputDir
      ? path.resolve(request.params.outputDir)
      : await fs.mkdtemp(
          path.join(os.tmpdir(), 'chrome-devtools-mcp-evidence-'),
        );
    await ensureDir(outputDir);

    const baseName =
      request.params.baseName ?? `evidence-${safeTimestampForFilename(capturedAt)}`;

    const files: Record<string, string> = {};

    // Text snapshot evidence
    if (request.params.includeTextSnapshot) {
      const snapshotPath = path.join(outputDir, `${baseName}.snapshot.txt`);
      // Leverage the standard response snapshot pipeline so we don't need extra
      // Context surface area here. When filePath is provided, the snapshot is
      // saved to disk instead of being inlined.
      response.includeSnapshot({
        verbose: request.params.textSnapshotVerbose,
        filePath: snapshotPath,
      });
      files.textSnapshot = snapshotPath;
    }

    // Wireframe evidence (capture once, render optional svg from same snapshot)
    let wireframeOutput:
      | Awaited<ReturnType<typeof captureWireframeSnapshot>>['output']
      | undefined;
    if (request.params.includeWireframeJson || request.params.includeWireframeSvg) {
      const {output, json, bytes} = await captureWireframeSnapshot(
        {
          params: {
            selectors: request.params.selectors,
            scopeSelector: request.params.scopeSelector,
            includeDescendants: request.params.includeDescendants,
            maxTotal: request.params.maxTotal,
            includeComputedStyles: request.params.includeComputedStyles,
            computedStylePreset: request.params.computedStylePreset,
            coordinateSpace: request.params.coordinateSpace,
          },
        } as any,
        context,
      );
      wireframeOutput = output;

      if (request.params.includeWireframeJson) {
        const jsonPath = path.join(outputDir, `${baseName}.wireframe.json`);
        // Prefer deterministic JSON string returned by captureWireframeSnapshot.
        await writeBytesFile(jsonPath, bytes);
        files.wireframeJson = jsonPath;
      }

      if (request.params.includeWireframeSvg) {
        const svg = renderSvgWireframe(output, {
          scale: request.params.svgScale,
          background: request.params.svgBackground,
          showLabels: request.params.svgShowLabels,
          showDimensions: request.params.svgShowDimensions,
          showSpacing: request.params.svgShowSpacing,
          strokeWidth: request.params.svgStrokeWidth,
          fillOpacity: request.params.svgFillOpacity,
          highlightChanged: false,
        });
        const svgPath = path.join(outputDir, `${baseName}.wireframe.svg`);
        await writeUtf8File(svgPath, svg);
        files.wireframeSvg = svgPath;
      }

      // Keep json in payload for easier downstream use when not writing to disk.
      // (Only if requested and small enough; otherwise rely on file paths.)
      void json;
    }

    // Screenshot evidence
    if (request.params.includeScreenshot) {
      const format = request.params.screenshotFormat;
      const quality = format === 'png' ? undefined : request.params.screenshotQuality;
      const screenshotBytes = (await page.screenshot({
        type: format,
        fullPage: request.params.screenshotFullPage,
        quality,
        optimizeForSpeed: true,
      })) as unknown as Uint8Array;

      const screenshotPath = path.join(outputDir, `${baseName}.screenshot.${format}`);
      await writeBytesFile(screenshotPath, screenshotBytes);
      files.screenshot = screenshotPath;
    }

    // Manifest / metadata
    const manifest = {
      kind: 'evidence_bundle',
      capturedAt,
      url,
      pageId,
      viewport,
      files,
      options: {
        selectors: request.params.selectors ?? null,
        scopeSelector: request.params.scopeSelector ?? null,
        includeDescendants: request.params.includeDescendants,
        maxTotal: request.params.maxTotal,
        includeComputedStyles: request.params.includeComputedStyles,
        computedStylePreset: request.params.computedStylePreset,
        coordinateSpace: request.params.coordinateSpace,
        includeTextSnapshot: request.params.includeTextSnapshot,
        textSnapshotVerbose: request.params.textSnapshotVerbose,
        includeWireframeJson: request.params.includeWireframeJson,
        includeWireframeSvg: request.params.includeWireframeSvg,
        includeScreenshot: request.params.includeScreenshot,
      },
    };

    const manifestPath = path.join(outputDir, `${baseName}.manifest.json`);
    await writeUtf8File(manifestPath, JSON.stringify(manifest, null, 2));
    files.manifest = manifestPath;

    // Optionally record into edit session (for Level 1 packages).
    const recorded = request.params.recordToSession
      ? context.appendEditChange(
          {
            type: 'capture_evidence_bundle',
            pageId,
            createdAt: capturedAt,
            description:
              request.params.description ??
              `Evidence bundle captured for ${url || '(unknown url)'}`,
            payload: {
              ...manifest,
              outputDir,
              wireframe: wireframeOutput ?? null,
            },
          },
          {sessionId: request.params.editSessionId, autoCreate: true},
        )
      : null;

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          outputDir,
          baseName,
          url,
          pageId,
          capturedAt,
          files,
          recorded,
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});


