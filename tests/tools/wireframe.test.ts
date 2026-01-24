/**
 * @license
 * Copyright 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'node:assert';
import {describe, it} from 'node:test';

import {
  svgSnapshot,
  svgSnapshotLiveEditing,
  wireframeSnapshot,
  wireframeSnapshotLiveEditing,
} from '../../src/tools/wireframe.js';
import {html, withMcpContext} from '../utils.js';

describe('wireframe', () => {
  describe('wireframe_snapshot', () => {
    it('returns JSON output', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<main>
            <div id="a" style="width: 120px; height: 40px; margin: 10px">A</div>
            <div class="b" style="width: 80px; height: 30px">B</div>
          </main>`,
        );

        await wireframeSnapshot.handler({params: {}}, response, context);

        const text = response.responseLines.join('\n');
        assert.ok(text.includes('"schemaVersion": 2'));
        assert.ok(text.includes('"elements"'));
      });
    });

    it('includes overlap/gap/clipping analysis when requested', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<main>
            <section id="overlap">
              <div id="overlap-a" style="width: 60px; height: 60px; background: #eee"></div>
              <div id="overlap-b" style="width: 60px; height: 60px; margin-top: -30px; background: #ddd"></div>
            </section>
            <section id="gap" style="display: flex; flex-direction: column; gap: 12px;">
              <div id="gap-a" style="width: 40px; height: 20px;"></div>
              <div id="gap-b" style="width: 40px; height: 20px;"></div>
            </section>
            <section id="clip" style="width: 50px; height: 50px; overflow: hidden;">
              <div id="clip-a" style="width: 120px; height: 120px;"></div>
            </section>
          </main>`,
        );

        await wireframeSnapshot.handler(
          {
            params: {
              includeComputedStyles: true,
              includeOverlapAnalysis: true,
              includeGapAnalysis: true,
              includeClippingAnalysis: true,
              analysisMinOverlapArea: 25,
              analysisMinGapPx: 6,
              analysisMaxFindings: 10,
            },
          },
          response,
          context,
        );

        const responseText = response.responseLines.join('\n');
        const jsonMatch = responseText.match(/```json\s*\n(.*)\n```/s);
        assert.ok(jsonMatch);
        const result = JSON.parse(jsonMatch[1]);
        assert.ok(result.analysis);
        assert.ok(result.analysis.overlaps?.length >= 1);
        assert.ok(result.analysis.gaps?.length >= 1);
        assert.ok(result.analysis.clipping?.length >= 1);
      });
    });
  });

  describe('svg_snapshot', () => {
    it('returns SVG content wrapped in JSON', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<main>
            <div id="a" style="width: 120px; height: 40px; margin: 10px">A</div>
            <div class="b" style="width: 80px; height: 30px">B</div>
          </main>`,
        );

        await svgSnapshot.handler(
          {
            params: {
              selectors: ['#a', '.b'],
              includeDescendants: true,
              showLabels: true,
              showDimensions: true,
              background: 'white',
            },
          },
          response,
          context,
        );

        // Check that JSON was appended to response
        const responseText = response.responseLines.join('\n');
        assert.ok(responseText.includes('```json'));
        assert.ok(responseText.includes('```'));

        // Extract JSON from between the code block markers
        const jsonMatch = responseText.match(/```json\s*\n(.*)\n```/s);
        assert.ok(jsonMatch);
        const result = JSON.parse(jsonMatch[1]);
        assert.equal(typeof result.svg, 'string');
        assert.ok(
          result.svg.startsWith('<?xml') || result.svg.startsWith('<svg'),
        );
        assert.ok(result.svg.includes('<svg'));
        assert.ok(result.svg.includes('<rect'));
        assert.ok(result.svg.includes('<text'));
        assert.ok(result.elementCount >= 2);
        assert.equal(result.truncated, false);
        assert.ok(result.viewport);
      });
    });

    it('renders overlap/gap/clipping overlays when enabled', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<main>
            <section id="overlap">
              <div id="overlap-a" style="width: 60px; height: 60px; background: #eee"></div>
              <div id="overlap-b" style="width: 60px; height: 60px; margin-top: -30px; background: #ddd"></div>
            </section>
            <section id="gap" style="display: flex; flex-direction: column; gap: 12px;">
              <div id="gap-a" style="width: 40px; height: 20px;"></div>
              <div id="gap-b" style="width: 40px; height: 20px;"></div>
            </section>
            <section id="clip" style="width: 50px; height: 50px; overflow: hidden;">
              <div id="clip-a" style="width: 120px; height: 120px;"></div>
            </section>
          </main>`,
        );

        await svgSnapshot.handler(
          {
            params: {
              includeComputedStyles: true,
              showOverlaps: true,
              showGaps: true,
              showClipping: true,
              analysisMinOverlapArea: 25,
              analysisMinGapPx: 6,
              analysisMaxFindings: 10,
            },
          },
          response,
          context,
        );

        const responseText = response.responseLines.join('\n');
        const jsonMatch = responseText.match(/```json\s*\n(.*)\n```/s);
        assert.ok(jsonMatch);
        const result = JSON.parse(jsonMatch[1]);
        assert.ok(result.svg.includes('wf-overlap'));
        assert.ok(result.svg.includes('wf-gap'));
        assert.ok(result.svg.includes('wf-clip'));
      });
    });
  });

  describe('wireframe_snapshot_live_editing', () => {
    it('returns a summary and artifact by default', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<main>
            <div id="a" style="width: 120px; height: 40px; margin: 10px">A</div>
            <div class="b" style="width: 80px; height: 30px">B</div>
          </main>`,
        );

        await wireframeSnapshotLiveEditing.handler({params: {}}, response, context);

        const responseText = response.responseLines.join('\n');
        const jsonMatch = responseText.match(/```json\s*\n(.*)\n```/s);
        assert.ok(jsonMatch);
        const result = JSON.parse(jsonMatch[1]);
        assert.equal(result.kind, 'live_editing_snapshot');
        assert.equal(result.version, 1);
        assert.ok(result.data?.summary);
        assert.equal(result.data?.outputMode, 'summary');
        assert.ok(result.artifacts?.[0]?.filename);
        assert.equal(result.artifacts?.[0]?.mimeType, 'application/json');
        assert.equal(result.data?.inline, undefined);
      });
    });
  });

  describe('svg_snapshot_live_editing', () => {
    it('returns a summary and artifact by default', async () => {
      await withMcpContext(async (response, context) => {
        const page = context.getSelectedPage();
        await page.setContent(
          html`<main>
            <div id="a" style="width: 120px; height: 40px; margin: 10px">A</div>
            <div class="b" style="width: 80px; height: 30px">B</div>
          </main>`,
        );

        await svgSnapshotLiveEditing.handler({params: {}}, response, context);

        const responseText = response.responseLines.join('\n');
        const jsonMatch = responseText.match(/```json\s*\n(.*)\n```/s);
        assert.ok(jsonMatch);
        const result = JSON.parse(jsonMatch[1]);
        assert.equal(result.kind, 'live_editing_snapshot');
        assert.equal(result.version, 1);
        assert.ok(result.data?.summary);
        assert.equal(result.data?.outputMode, 'file');
        assert.ok(result.artifacts?.[0]?.filename);
        assert.equal(result.artifacts?.[0]?.mimeType, 'text/plain');
        assert.equal(result.data?.svg, undefined);
      });
    });
  });
});



