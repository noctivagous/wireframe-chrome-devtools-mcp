/**
 * @license
 * Copyright 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  beginLiveEditingSessionHandler,
  updateFromUserChanges,
} from '../../src/tools/live-editing.js';
import {html, withMcpContext} from '../utils.js';

function extractJson(responseText: string) {
  const jsonMatch = responseText.match(/```json\s*\n(.*)\n```/s);
  assert.ok(jsonMatch, 'Expected JSON payload');
  return JSON.parse(jsonMatch[1]);
}

describe('live editing tools', () => {
  describe('begin_live_editing_session', () => {
    it('returns a structured live-editing payload', async () => {
      await withMcpContext(async (response, context) => {
        const url = 'data:text/html,<html><body><main>Live</main></body></html>';
        await beginLiveEditingSessionHandler(
          {params: {url}},
          response,
          context,
        );

        const payload = extractJson(response.responseLines.join('\n'));
        assert.equal(payload.kind, 'live_editing_session');
        assert.equal(payload.version, 1);
        assert.ok(payload.data?.page?.finalUrl);
        assert.equal(payload.data?.page?.requestedUrl, url);
        assert.equal(payload.data?.overlay?.installed, true);
        assert.ok(payload.data?.overlay?.patchId);
        assert.ok(payload.next_tool_calls?.length >= 1);
      });
    });
  });

  describe('update_from_user_changes', () => {
    it('returns annotations + snapshot artifacts', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<main>
            <div id="a" style="width: 120px; height: 40px; margin: 10px">A</div>
            <div class="b" style="width: 80px; height: 30px">B</div>
          </main>`,
        );

        await updateFromUserChanges.handler(
          {params: {includeAnnotations: true, includeSnapshots: {wireframe: true}}},
          response,
          context,
        );

        const payload = extractJson(response.responseLines.join('\n'));
        assert.equal(payload.kind, 'live_editing_update');
        assert.equal(payload.version, 1);
        assert.ok(Array.isArray(payload.data?.annotations));
        assert.equal(typeof payload.data?.pageNotes, 'string');
        assert.ok(payload.artifacts?.length >= 1);
        assert.ok(payload.data?.snapshots?.wireframe?.summary);
      });
    });

    it('returns move annotation targets when present', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<main>
            <div id="source" style="width: 120px; height: 40px; margin: 10px">A</div>
            <div id="target" style="width: 80px; height: 30px">B</div>
          </main>`,
        );

        await beginLiveEditingSessionHandler(
          {params: {url: 'about:blank', injectOverlay: true}},
          response,
          context,
        );

        await page.evaluate(() => {
          const api = (window as any).__MCP_LIVE_EDITING__;
          if (!api) {
            return;
          }
          api.addAnnotation({
            selector: '#source',
            text: 'Move near target',
            type: 'move',
          });
          const annotations = api.exportAnnotations();
          const last = annotations[annotations.length - 1];
          if (last) {
            last.targetSelector = '#target';
            api.importAnnotations(annotations);
          }
        });

        const updateResponse = {responseLines: [] as string[]};
        await updateFromUserChanges.handler(
          {params: {includeAnnotations: true, includeSnapshots: {wireframe: false}}},
          updateResponse as any,
          context,
        );

        const payload = extractJson(updateResponse.responseLines.join('\n'));
        const move = (payload.data?.annotations ?? []).find(
          (ann: any) => ann.type === 'move',
        );
        assert.ok(move);
        assert.equal(move.targetSelector, '#target');
        assert.ok(payload.batch_ops_plan);
        assert.equal(payload.batch_ops_plan.tool, 'batch_ops');
      });
    });

    it('clears annotations and notes after update', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<main>
            <div id="source" style="width: 120px; height: 40px; margin: 10px">A</div>
          </main>`,
        );

        await beginLiveEditingSessionHandler(
          {params: {url: 'about:blank', injectOverlay: true}},
          response,
          context,
        );

        await page.evaluate(() => {
          const api = (window as any).__MCP_LIVE_EDITING__;
          if (!api) {
            return;
          }
          api.addAnnotation({
            selector: '#source',
            text: 'First note',
            type: 'note',
          });
          api.setPageNotes('Page note');
        });

        const firstResponse = {responseLines: [] as string[]};
        await updateFromUserChanges.handler(
          {params: {includeAnnotations: true, includeSnapshots: {wireframe: false}}},
          firstResponse as any,
          context,
        );
        const firstPayload = extractJson(firstResponse.responseLines.join('\n'));
        assert.ok((firstPayload.data?.annotations ?? []).length > 0);
        assert.equal(firstPayload.data?.pageNotes, 'Page note');

        const secondResponse = {responseLines: [] as string[]};
        await updateFromUserChanges.handler(
          {params: {includeAnnotations: true, includeSnapshots: {wireframe: false}}},
          secondResponse as any,
          context,
        );
        const secondPayload = extractJson(secondResponse.responseLines.join('\n'));
        assert.equal((secondPayload.data?.annotations ?? []).length, 0);
        assert.equal(secondPayload.data?.pageNotes, '');
      });
    });

    it('uses baseline wireframe for diff summaries', async () => {
      await withMcpContext(async (response, context) => {
        const url =
          'data:text/html,<html><body><main><div id="box" style="width:100px;height:20px">Box</div></main></body></html>';
        await beginLiveEditingSessionHandler(
          {params: {url, injectOverlay: true, snapshots: {wireframe: true, svg: false}}},
          response,
          context,
        );

        const page = context.getSelectedPage();
        await page.evaluate(() => {
          const el = document.querySelector('#box') as HTMLElement | null;
          if (el) {
            el.style.width = '140px';
          }
        });

        const updateResponse = {responseLines: [] as string[]};
        await updateFromUserChanges.handler(
          {params: {includeAnnotations: false, includeSnapshots: {wireframe: true}}},
          updateResponse as any,
          context,
        );
        const payload = extractJson(updateResponse.responseLines.join('\n'));
        const diffSummary = payload.data?.snapshots?.wireframe?.diffSummary;
        assert.ok(diffSummary);
        assert.ok(diffSummary.changed >= 1 || diffSummary.added >= 1 || diffSummary.removed >= 1);
      });
    });

    it('returns annotation insights and priority ordering', async () => {
      await withMcpContext(async (response, context) => {
        await beginLiveEditingSessionHandler(
          {params: {url: 'about:blank', injectOverlay: true}},
          response,
          context,
        );
        const page = context.getSelectedPage();
        await page.setContent(
          html`<main>
            <div id="alpha">Alpha</div>
            <div id="beta">Beta</div>
          </main>`,
        );

        await page.evaluate(() => {
          const api = (window as any).__MCP_LIVE_EDITING__;
          api.addAnnotation({
            selector: '#alpha',
            text: 'Fix broken layout',
            type: 'note',
          });
          api.addAnnotation({
            selector: '#beta',
            text: 'Update copy',
            type: 'note',
          });
        });

        const updateResponse = {responseLines: [] as string[]};
        await updateFromUserChanges.handler(
          {params: {includeAnnotations: true, includeSnapshots: {wireframe: false}}},
          updateResponse as any,
          context,
        );
        const payload = extractJson(updateResponse.responseLines.join('\n'));
        const insights = payload.data?.annotationInsights ?? [];
        assert.ok(insights.length >= 2);
        const priorities = payload.data?.prioritizedAnnotationIds ?? [];
        assert.ok(priorities.length >= 2);
      });
    });

    it('suggests style ops for layout hints', async () => {
      await withMcpContext(async (response, context) => {
        await beginLiveEditingSessionHandler(
          {params: {url: 'about:blank', injectOverlay: true}},
          response,
          context,
        );
        const page = context.getSelectedPage();
        await page.setContent(
          html`<main>
            <div id="box">Box</div>
          </main>`,
        );

        await page.evaluate(() => {
          const api = (window as any).__MCP_LIVE_EDITING__;
          api.addAnnotation({
            selector: '#box',
            text: 'Add padding 16',
            type: 'note',
          });
        });

        const updateResponse = {responseLines: [] as string[]};
        await updateFromUserChanges.handler(
          {params: {includeAnnotations: true, includeSnapshots: {wireframe: false}}},
          updateResponse as any,
          context,
        );
        const payload = extractJson(updateResponse.responseLines.join('\n'));
        const plan = payload.batch_ops_plan;
        assert.ok(plan);
        const ops = plan.params?.operations ?? [];
        assert.ok(ops.some((op: any) => op.tool === 'manipulate_dom'));
      });
    });
  });
});

