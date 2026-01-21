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

type ExportMode = 'single_html' | 'split_files';

async function ensureDir(dir: string): Promise<string> {
  const abs = path.resolve(dir);
  await fs.mkdir(abs, {recursive: true});
  return abs;
}

async function mkTempDir(prefix: string): Promise<string> {
  return await fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

export const exportPrototypeState = defineTool({
  name: 'export_prototype_state',
  description:
    'Export the current page into prototype files (HTML/CSS/JS) for browser-first iteration.\n\n' +
    'This is intended for prototyping workflows where the browser is the source of truth: the export captures current DOM plus injected CSS/JS patches, and writes files only when explicitly requested.\n\n' +
    '**Note:** The injected chatbox UI is excluded from the export by default.',
  annotations: {
    category: ToolCategory.DEBUGGING,
    readOnlyHint: false,
  },
  schema: {
    outputDir: zod
      .string()
      .optional()
      .describe('Optional output directory. If omitted, a temporary directory is created.'),
    baseName: zod
      .string()
      .optional()
      .default('prototype')
      .describe('Base filename used for outputs (e.g. prototype.html).'),
    mode: zod
      .enum(['single_html', 'split_files'] as [ExportMode, ExportMode])
      .optional()
      .default('single_html')
      .describe(
        'Export mode. `single_html` writes one self-contained HTML file. `split_files` writes index.html + styles.css + app.js (exporting only MCP-injected patches into the CSS/JS files).',
      ),
    includeExternal: zod
      .boolean()
      .optional()
      .default(true)
      .describe('If true, keep existing external <link> and <script src> references in the exported HTML.'),
    includeChatbox: zod
      .boolean()
      .optional()
      .default(false)
      .describe('If true, include the injected chatbox UI in the exported HTML. Default false.'),
  },
  handler: async (request, response, context) => {
    const page = context.getSelectedPage();
    const pageId = context.getPageId(page) ?? 0;

    const outputDir = request.params.outputDir
      ? await ensureDir(request.params.outputDir)
      : await mkTempDir('mcp-prototype-');
    const baseName = request.params.baseName ?? 'prototype';
    const mode = request.params.mode ?? 'single_html';

    const payload = await page.evaluate(
      ({includeExternal, includeChatbox}) => {
        const CHATBOX_ROOT_ID = 'mcp-chatbox-root';
        const PATCH_ID_ATTR = 'data-mcp-patch-id';
        const PATCH_OWNER_ATTR = 'data-mcp-patch-owner';
        const PATCH_KIND_ATTR = 'data-mcp-patch-kind';

        const clone = document.documentElement.cloneNode(true) as HTMLElement;
        if (!includeChatbox) {
          const chat = clone.querySelector(`#${CHATBOX_ROOT_ID}`);
          if (chat) chat.remove();
        }

        // Strip MCP patch attributes (keep the content).
        for (const el of Array.from(clone.querySelectorAll(`[${PATCH_ID_ATTR}], [${PATCH_OWNER_ATTR}], [${PATCH_KIND_ATTR}]`))) {
          (el as HTMLElement).removeAttribute(PATCH_ID_ATTR);
          (el as HTMLElement).removeAttribute(PATCH_OWNER_ATTR);
          (el as HTMLElement).removeAttribute(PATCH_KIND_ATTR);
        }

        if (!includeExternal) {
          for (const el of Array.from(clone.querySelectorAll('link[rel="stylesheet"][href]'))) {
            el.remove();
          }
          for (const el of Array.from(clone.querySelectorAll('script[src]'))) {
            el.remove();
          }
        }

        // Extract MCP-injected patches from the live page (not the clone).
        const patchStyles: string[] = [];
        const patchScripts: string[] = [];

        const styleNodes = Array.from(document.querySelectorAll('style[data-mcp-patch-kind="css"]')) as HTMLStyleElement[];
        for (const s of styleNodes) {
          const t = (s.textContent ?? '').trim();
          if (t) patchStyles.push(t);
        }
        const scriptNodes = Array.from(document.querySelectorAll('script[data-mcp-patch-kind="js"]')) as HTMLScriptElement[];
        for (const s of scriptNodes) {
          const t = (s.textContent ?? '').trim();
          if (t) patchScripts.push(t);
        }

        // Serialize clone.
        const doctype = '<!doctype html>';
        const html = doctype + '\n' + clone.outerHTML;

        return {
          html,
          patchStyles: patchStyles.join('\n\n'),
          patchScripts: patchScripts.join('\n\n'),
          url: location.href,
          title: document.title,
        };
      },
      {
        includeExternal: request.params.includeExternal ?? true,
        includeChatbox: request.params.includeChatbox ?? false,
      },
    );

    const files: Record<string, string> = {};

    if (mode === 'single_html') {
      const htmlPath = path.join(outputDir, `${baseName}.html`);
      await fs.writeFile(htmlPath, payload.html, 'utf8');
      files.html = htmlPath;
    } else {
      const htmlPath = path.join(outputDir, `index.html`);
      const cssPath = path.join(outputDir, `styles.css`);
      const jsPath = path.join(outputDir, `app.js`);

      // Remove existing injected patch <style>/<script> tags from HTML and replace with refs.
      // We do this post-serialize to keep it robust (simple string ops).
      let html = payload.html;
      html = html.replaceAll(/<style[^>]*data-mcp-patch-kind="css"[^>]*>[\s\S]*?<\/style>\s*/g, '');
      html = html.replaceAll(/<script[^>]*data-mcp-patch-kind="js"[^>]*>[\s\S]*?<\/script>\s*/g, '');

      const headCloseIdx = html.toLowerCase().lastIndexOf('</head>');
      const inject =
        `\n<link rel="stylesheet" href="./styles.css">\n<script defer src="./app.js"></script>\n`;
      if (headCloseIdx !== -1) {
        html = html.slice(0, headCloseIdx) + inject + html.slice(headCloseIdx);
      } else {
        html = inject + html;
      }

      await fs.writeFile(htmlPath, html, 'utf8');
      await fs.writeFile(cssPath, payload.patchStyles ? payload.patchStyles + '\n' : '/* (no injected CSS patches found) */\n', 'utf8');
      await fs.writeFile(jsPath, payload.patchScripts ? payload.patchScripts + '\n' : '// (no injected JS patches found)\n', 'utf8');

      files.html = htmlPath;
      files.css = cssPath;
      files.js = jsPath;
    }

    response.appendResponseLine('```json');
    response.appendResponseLine(
      JSON.stringify(
        {
          pageId,
          outputDir,
          mode,
          baseName,
          source: {url: payload.url, title: payload.title},
          files,
          exported: {
            hasInjectedCssPatches: Boolean(payload.patchStyles && payload.patchStyles.trim()),
            hasInjectedJsPatches: Boolean(payload.patchScripts && payload.patchScripts.trim()),
          },
        },
        null,
        2,
      ),
    );
    response.appendResponseLine('```');
  },
});


