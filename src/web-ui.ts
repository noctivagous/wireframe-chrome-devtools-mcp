/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import {URL} from 'node:url';

export type ToolToggleView = {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
};

export type WebUiDeps = {
  host: string;
  port: number;
  getTools(): ToolToggleView[];
  getConfigMeta(): {configPath: string; updatedAt: string};
  setDisabledTools(disabledTools: string[]): Promise<void>;
  log: (...args: any[]) => void;
};

function htmlPage(): string {
  // Inline HTML/JS to keep this lightweight.
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Chrome DevTools MCP — Tool Toggles</title>
  <style>
    :root { color-scheme: light dark; }
    body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; margin: 0; }
    header { padding: 16px 18px; border-bottom: 1px solid rgba(127,127,127,0.25); }
    header h1 { margin: 0 0 6px 0; font-size: 16px; }
    header .meta { font-size: 12px; opacity: 0.8; display: flex; gap: 10px; flex-wrap: wrap; }
    main { padding: 16px 18px; }
    .controls { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
    input[type="search"] { padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(127,127,127,0.35); min-width: 240px; }
    button { padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(127,127,127,0.35); background: transparent; cursor: pointer; }
    button.primary { background: #111827; color: white; border-color: #111827; }
    button:disabled { opacity: 0.6; cursor: not-allowed; }
    .groups { display: flex; flex-direction: column; gap: 12px; margin-top: 14px; }
    details { border: 1px solid rgba(127,127,127,0.25); border-radius: 12px; overflow: hidden; }
    summary { list-style: none; display: flex; align-items: center; gap: 10px; padding: 10px 12px; cursor: pointer; user-select: none; }
    summary::-webkit-details-marker { display: none; }
    summary .cat { font-weight: 600; font-size: 13px; }
    summary .count { font-size: 12px; opacity: 0.75; }
    summary .spacer { flex: 1; }
    summary .state { font-size: 12px; opacity: 0.8; }
    summary .actions { display: flex; gap: 6px; align-items: center; }
    summary .actions button { padding: 4px 8px; border-radius: 8px; font-size: 12px; }
    .tool-list { padding: 8px 12px 12px 12px; display: flex; flex-direction: column; gap: 8px; }
    .tool { display: grid; grid-template-columns: 26px 1fr; gap: 10px; padding: 8px 10px; border-radius: 10px; border: 1px solid rgba(127,127,127,0.18); }
    .tool .name { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace; font-size: 12px; }
    .tool .desc { font-size: 12px; opacity: 0.85; margin-top: 4px; max-width: 90ch; }
    .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; border: 1px solid rgba(127,127,127,0.35); font-size: 11px; opacity: 0.9; }
    .status { margin-left: auto; font-size: 12px; opacity: 0.8; }
  </style>
</head>
<body>
  <header>
    <h1>Tool toggles</h1>
    <div class="meta">
      <div>Config: <span id="configPath"></span></div>
      <div>Updated: <span id="updatedAt"></span></div>
      <div class="status" id="status"></div>
    </div>
  </header>
  <main>
    <div class="controls">
      <input id="q" type="search" placeholder="Filter tools (name/category/description)..." />
      <button id="enableAll">Enable all</button>
      <button id="disableAll">Disable all</button>
      <button id="expandAll">Expand all</button>
      <button id="collapseAll">Collapse all</button>
      <button class="primary" id="save">Save</button>
      <button id="reload">Reload</button>
    </div>
    <div class="groups" id="groups"></div>
  </main>

  <script>
    const $ = (id) => document.getElementById(id);
    let tools = [];
    const openGroups = new Set();
    let forceCollapsed = false;

    function setStatus(msg) { $('status').textContent = msg || ''; }

    async function load() {
      setStatus('Loading…');
      const r = await fetch('/api/tools');
      const j = await r.json();
      tools = j.tools || [];
      $('configPath').textContent = j.configPath || '';
      $('updatedAt').textContent = j.updatedAt || '';
      render();
      setStatus('');
    }

    function computeGroupState(items) {
      const enabledCount = items.filter(t => t.enabled).length;
      if (enabledCount === 0) return {checked: false, indeterminate: false, label: 'off'};
      if (enabledCount === items.length) return {checked: true, indeterminate: false, label: 'on'};
      return {checked: false, indeterminate: true, label: 'mixed'};
    }

    function render() {
      const q = ($('q').value || '').toLowerCase().trim();
      const groupsEl = $('groups');
      groupsEl.innerHTML = '';

      const filtered = tools.filter(t => {
        if (!q) return true;
        return (t.name || '').toLowerCase().includes(q) ||
               (t.category || '').toLowerCase().includes(q) ||
               (t.description || '').toLowerCase().includes(q);
      });

      const byCategory = new Map();
      for (const t of filtered) {
        const cat = t.category || 'unknown';
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat).push(t);
      }

      const cats = Array.from(byCategory.keys()).sort((a,b) => a.localeCompare(b));
      for (const cat of cats) {
        const items = byCategory.get(cat) || [];
        const state = computeGroupState(items);
        const details = document.createElement('details');
        details.open = forceCollapsed ? openGroups.has(cat) : (openGroups.has(cat) || openGroups.size === 0);
        details.addEventListener('toggle', () => {
          if (details.open) openGroups.add(cat);
          else openGroups.delete(cat);
        });

        const summary = document.createElement('summary');
        summary.innerHTML = \`
          <input type="checkbox" data-group="\${cat}">
          <span class="cat">\${cat}</span>
          <span class="count">(\${items.length})</span>
          <span class="actions">
            <button type="button" data-group-enable="\${cat}">Enable</button>
            <button type="button" data-group-disable="\${cat}">Disable</button>
          </span>
          <span class="spacer"></span>
          <span class="state">\${state.label === 'mixed' ? '− mixed' : (state.label === 'on' ? '✓ on' : 'off')}</span>
        \`;
        details.appendChild(summary);

        const groupCb = summary.querySelector('input[type="checkbox"][data-group]');
        groupCb.checked = state.checked;
        groupCb.indeterminate = state.indeterminate;
        groupCb.addEventListener('change', (e) => {
          const on = e.target.checked;
          for (const t of items) t.enabled = on;
          render();
        });

        const enableBtn = summary.querySelector('button[data-group-enable]');
        const disableBtn = summary.querySelector('button[data-group-disable]');
        enableBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          for (const t of items) t.enabled = true;
          render();
        });
        disableBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          for (const t of items) t.enabled = false;
          render();
        });

        const list = document.createElement('div');
        list.className = 'tool-list';
        for (const t of items.sort((a,b) => (a.name||'').localeCompare(b.name||''))) {
          const el = document.createElement('div');
          el.className = 'tool';
          el.innerHTML = \`
            <div><input type="checkbox" \${t.enabled ? 'checked' : ''} data-tool="\${t.name}"></div>
            <div>
              <div class="name">\${t.name}</div>
              <div class="desc">\${(t.description || '').replace(/</g,'&lt;')}</div>
            </div>
          \`;
          list.appendChild(el);
        }
        details.appendChild(list);
        groupsEl.appendChild(details);
      }

      groupsEl.querySelectorAll('input[type="checkbox"][data-tool]').forEach(cb => {
        cb.addEventListener('change', (e) => {
          const name = e.target.getAttribute('data-tool');
          const tool = tools.find(x => x.name === name);
          if (tool) tool.enabled = e.target.checked;
          render();
        });
      });
    }

    $('q').addEventListener('input', render);
    $('reload').addEventListener('click', load);
    $('enableAll').addEventListener('click', () => { tools.forEach(t => t.enabled = true); render(); });
    $('disableAll').addEventListener('click', () => { tools.forEach(t => t.enabled = false); render(); });
    $('expandAll').addEventListener('click', () => {
      // expand all groups currently visible (from current tool list)
      forceCollapsed = false;
      const cats = new Set((tools || []).map(t => t.category || 'unknown'));
      for (const c of cats) openGroups.add(c);
      render();
    });
    $('collapseAll').addEventListener('click', () => {
      forceCollapsed = true;
      openGroups.clear();
      render();
    });

    $('save').addEventListener('click', async () => {
      setStatus('Saving…');
      const disabledTools = tools.filter(t => !t.enabled).map(t => t.name);
      const r = await fetch('/api/tools', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({disabledTools}),
      });
      if (!r.ok) {
        setStatus('Save failed');
        return;
      }
      const j = await r.json();
      $('updatedAt').textContent = j.updatedAt || $('updatedAt').textContent;
      setStatus('Saved');
      setTimeout(() => setStatus(''), 1200);
    });

    load().catch(err => setStatus(String(err)));
  </script>
</body>
</html>`;
}

function sendJson(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  res.end(body);
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  if (!text) return null;
  return JSON.parse(text);
}

export function startWebUi(deps: WebUiDeps): http.Server {
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
      if (req.method === 'GET' && url.pathname === '/') {
        const body = htmlPage();
        res.writeHead(200, {
          'content-type': 'text/html; charset=utf-8',
          'cache-control': 'no-store',
        });
        res.end(body);
        return;
      }

      if (req.method === 'GET' && url.pathname === '/api/tools') {
        const meta = deps.getConfigMeta();
        return sendJson(res, 200, {
          tools: deps.getTools(),
          configPath: meta.configPath,
          updatedAt: meta.updatedAt,
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/tools') {
        const body = await readJsonBody(req);
        const disabledTools =
          body && Array.isArray(body.disabledTools)
            ? body.disabledTools.filter((x: any) => typeof x === 'string')
            : [];
        await deps.setDisabledTools(disabledTools);
        const meta = deps.getConfigMeta();
        return sendJson(res, 200, {ok: true, updatedAt: meta.updatedAt});
      }

      // Simple health check.
      if (req.method === 'GET' && url.pathname === '/healthz') {
        return sendJson(res, 200, {ok: true});
      }

      res.writeHead(404, {'content-type': 'text/plain; charset=utf-8'});
      res.end('Not found');
    } catch (e) {
      deps.log('web-ui error', e);
      sendJson(res, 500, {ok: false, error: String((e as Error)?.message ?? e)});
    }
  });

  server.listen(deps.port, deps.host, () => {
    deps.log(`Tool toggles UI: http://${deps.host}:${deps.port}`);
  });
  return server;
}


