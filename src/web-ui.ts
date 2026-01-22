/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import http from 'node:http';
import {URL} from 'node:url';
import {exec} from 'node:child_process';
import {promisify} from 'node:util';

const execAsync = promisify(exec);

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
    :root {
      --bg-primary: #ffffff;
      --bg-secondary: #f9fafb;
      --text-primary: #111827;
      --text-secondary: #4b5563;
      --accent: #2563eb;
      --border: rgba(0, 0, 0, 0.1);
      --card-bg: #ffffff;
      --card-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06);
      --header-bg: #ffffff;
      --sidebar-bg: #f3f4f6;
    }

    @media (prefers-color-scheme: dark) {
      :root {
        --bg-primary: #111827;
        --bg-secondary: #1f2937;
        --text-primary: #f9fafb;
        --text-secondary: #d1d5db;
        --accent: #3b82f6;
        --border: rgba(255, 255, 255, 0.1);
        --card-bg: #1f2937;
        --card-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
        --header-bg: #111827;
        --sidebar-bg: #111827;
      }
    }

    body {
      font-family: 'Inter', system-ui, -apple-system, sans-serif;
      margin: 0;
      background-color: var(--bg-primary);
      color: var(--text-primary);
      height: 100vh;
      display: flex;
      flex-direction: column;
    }

    header {
      background: var(--header-bg);
      padding: 12px 24px;
      border-bottom: 1px solid var(--border);
      z-index: 10;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    header h1 {
      margin: 0;
      font-size: 18px;
      font-weight: 700;
      letter-spacing: -0.025em;
    }

    header .meta {
      display: flex;
      gap: 20px;
      align-items: center;
      font-size: 13px;
    }

    .meta-item {
      display: flex;
      flex-direction: column;
    }

    .meta-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      opacity: 0.5;
      font-weight: 600;
    }

    .meta-value {
      font-weight: 500;
    }

    main {
      flex: 1;
      display: flex;
      overflow: hidden;
    }

    #sidebar {
      width: 260px;
      background: var(--sidebar-bg);
      border-right: 1px solid var(--border);
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      overflow-y: auto;
    }

    .sidebar-item {
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 14px;
      cursor: pointer;
      color: var(--text-secondary);
      transition: all 0.2s;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .sidebar-item:hover {
      background: var(--border);
      color: var(--text-primary);
    }

    .sidebar-item.active {
      background: var(--accent);
      color: white;
    }

    .sidebar-item .count {
      font-size: 12px;
      opacity: 0.7;
    }

    #content-area {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .controls-bar {
      padding: 16px 24px;
      border-bottom: 1px solid var(--border);
      background: var(--bg-primary);
      display: flex;
      gap: 12px;
      align-items: center;
      flex-wrap: wrap;
    }

    .search-wrapper {
      position: relative;
      flex: 1;
      min-width: 300px;
    }

    input[type="search"] {
      width: 100%;
      padding: 10px 16px;
      border-radius: 12px;
      border: 1px solid var(--border);
      background: var(--bg-secondary);
      color: var(--text-primary);
      font-size: 14px;
      outline: none;
      transition: border-color 0.2s;
    }

    input[type="search"]:focus {
      border-color: var(--accent);
    }

    .btn-group {
      display: flex;
      gap: 8px;
    }

    button {
      padding: 8px 16px;
      border-radius: 10px;
      border: 1px solid var(--border);
      background: var(--bg-primary);
      color: var(--text-primary);
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    button:hover {
      background: var(--bg-secondary);
      border-color: var(--text-secondary);
    }

    button.primary {
      background: var(--accent);
      color: white;
      border-color: var(--accent);
    }

    button.primary:hover {
      opacity: 0.9;
    }

    #tools-grid {
      flex: 1;
      padding: 24px;
      overflow-y: auto;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
      gap: 20px;
      align-content: start;
    }

    .tool-card {
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 16px;
      padding: 16px;
      box-shadow: var(--card-shadow);
      display: flex;
      flex-direction: column;
      gap: 12px;
      transition: transform 0.2s, box-shadow 0.2s;
    }

    .tool-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }

    .tool-card-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }

    .tool-name {
      font-family: ui-monospace, monospace;
      font-weight: 600;
      font-size: 14px;
      color: var(--accent);
    }

    .tool-desc {
      font-size: 13px;
      line-height: 1.5;
      color: var(--text-secondary);
    }

    .switch {
      position: relative;
      display: inline-block;
      width: 44px;
      height: 24px;
    }

    .switch input {
      opacity: 0;
      width: 0;
      height: 0;
    }

    .slider {
      position: absolute;
      cursor: pointer;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background-color: #ccc;
      transition: .4s;
      border-radius: 24px;
    }

    .slider:before {
      position: absolute;
      content: "";
      height: 18px;
      width: 18px;
      left: 3px;
      bottom: 3px;
      background-color: white;
      transition: .4s;
      border-radius: 50%;
    }

    input:checked + .slider {
      background-color: var(--accent);
    }

    input:focus + .slider {
      box-shadow: 0 0 1px var(--accent);
    }

    input:checked + .slider:before {
      transform: translateX(20px);
    }

    .category-title {
      grid-column: 1 / -1;
      font-size: 18px;
      font-weight: 700;
      margin-top: 10px;
      margin-bottom: 5px;
      display: flex;
      align-items: center;
      gap: 10px;
    }

    .category-title::after {
      content: "";
      flex: 1;
      height: 1px;
      background: var(--border);
    }

    .badge {
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 99px;
      background: var(--border);
      font-weight: 600;
    }

    #status-toast {
      position: fixed;
      bottom: 24px;
      right: 24px;
      padding: 12px 24px;
      border-radius: 12px;
      background: var(--text-primary);
      color: var(--bg-primary);
      font-weight: 500;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
      transform: translateY(100px);
      transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
      z-index: 100;
    }

    #status-toast.visible {
      transform: translateY(0);
    }
  </style>
</head>
<body>
  <header>
    <h1>Tool toggles</h1>
    <div class="meta">
      <div class="meta-item">
        <span class="meta-label">Enabled</span>
        <span class="meta-value" id="enabledCount">0 of 0</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Config</span>
        <span class="meta-value" id="configPath">...</span>
      </div>
      <div class="meta-item">
        <span class="meta-label">Last Updated</span>
        <span class="meta-value" id="updatedAt">...</span>
      </div>
    </div>
  </header>
  <main>
    <div id="sidebar"></div>
    <div id="content-area">
      <div class="controls-bar">
        <div class="search-wrapper">
          <input id="q" type="search" placeholder="Filter tools (name/category/description)..." />
        </div>
        <div class="btn-group">
          <button id="enableAll">Enable all</button>
          <button id="disableAll">Disable all</button>
          <button class="primary" id="save">Save Changes</button>
          <button id="reload">Reload</button>
        </div>
      </div>
      <div id="tools-grid"></div>
    </div>
  </main>
  <div id="status-toast"></div>

  <script>
    const $ = (id) => document.getElementById(id);
    let tools = [];
    let selectedCategory = 'all';

    function setStatus(msg) {
      const toast = $('status-toast');
      if (msg) {
        toast.textContent = msg;
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 2000);
      }
    }

    async function load() {
      const r = await fetch('/api/tools');
      const j = await r.json();
      tools = j.tools || [];
      $('configPath').textContent = j.configPath.split('/').pop() || '';
      $('configPath').title = j.configPath;
      $('updatedAt').textContent = new Date(j.updatedAt).toLocaleTimeString();
      render();
    }

    function render() {
      const q = ($('q').value || '').toLowerCase().trim();
      const grid = $('tools-grid');
      const sidebar = $('sidebar');
      
      const totalTools = tools.length;
      const enabledTools = tools.filter(t => t.enabled).length;
      $('enabledCount').textContent = enabledTools + ' of ' + totalTools;

      const filtered = tools.filter(t => {
        const matchesQuery = !q || 
               (t.name || '').toLowerCase().includes(q) ||
               (t.category || '').toLowerCase().includes(q) ||
               (t.description || '').toLowerCase().includes(q);
        
        const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
        
        return matchesQuery && matchesCategory;
      });

      // Update Sidebar
      const categories = ['all', ...new Set(tools.map(t => t.category))].sort();
      sidebar.innerHTML = '';
      categories.forEach(cat => {
        const item = document.createElement('div');
        item.className = 'sidebar-item' + (selectedCategory === cat ? ' active' : '');
        const count = cat === 'all' ? tools.length : tools.filter(t => t.category === cat).length;
        item.innerHTML = \`<span>\${cat.charAt(0).toUpperCase() + cat.slice(1)}</span> <span class="count">\${count}</span>\`;
        item.onclick = () => {
          selectedCategory = cat;
          render();
        };
        sidebar.appendChild(item);
      });

      // Update Grid
      grid.innerHTML = '';
      
      if (filtered.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 40px; opacity: 0.5;">No tools found matching your criteria</div>';
        return;
      }

      const byCategory = new Map();
      for (const t of filtered) {
        const cat = t.category || 'unknown';
        if (!byCategory.has(cat)) byCategory.set(cat, []);
        byCategory.get(cat).push(t);
      }

      const cats = Array.from(byCategory.keys()).sort();
      cats.forEach(cat => {
        if (selectedCategory === 'all') {
          const title = document.createElement('div');
          title.className = 'category-title';
          title.textContent = cat;
          grid.appendChild(title);
        }

        const items = byCategory.get(cat).sort((a,b) => a.name.localeCompare(b.name));
        items.forEach(t => {
          const card = document.createElement('div');
          card.className = 'tool-card';
          card.innerHTML = \`<div class="tool-card-header">
              <div class="tool-name">\${t.name}</div>
              <label class="switch">
                <input type="checkbox" \${t.enabled ? 'checked' : ''} data-tool="\${t.name}">
                <span class="slider"></span>
              </label>
            </div>
            <div class="tool-desc">\${(t.description || '').replace(/</g,'&lt;')}</div>\`;
          
          const cb = card.querySelector('input');
          cb.onchange = (e) => {
            t.enabled = e.target.checked;
            render();
          };
          
          grid.appendChild(card);
        });
      });
    }

    $('q').oninput = render;
    $('reload').onclick = load;
    $('enableAll').onclick = () => { tools.forEach(t => t.enabled = true); render(); };
    $('disableAll').onclick = () => { tools.forEach(t => t.enabled = false); render(); };

    $('save').onclick = async () => {
      setStatus('Saving changes...');
      const disabledTools = tools.filter(t => !t.enabled).map(t => t.name);
      const r = await fetch('/api/tools', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({disabledTools}),
      });
      if (r.ok) {
        const j = await r.json();
        $('updatedAt').textContent = new Date().toLocaleTimeString();
        setStatus('Changes saved successfully!');
      } else {
        setStatus('Failed to save changes.');
      }
    };

    load();
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

async function killProcessOnPort(port: number): Promise<void> {
  try {
    // Try lsof first (works on Linux and macOS)
    const {stdout} = await execAsync(`lsof -ti :${port}`);
    const pid = stdout.trim();
    if (pid) {
      await execAsync(`kill ${pid}`);
      // Wait a moment for the port to be released
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  } catch (error) {
    // lsof might not be available or no process found, try fuser (Linux)
    try {
      await execAsync(`fuser -k ${port}/tcp`);
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch {
      // If both fail, that's okay - we'll let the error propagate
    }
  }
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

  let retryAttempted = false;

  const attemptListen = () => {
    server.listen(deps.port, deps.host, () => {
      deps.log(`Tool toggles UI: http://${deps.host}:${deps.port}`);
    });
  };

  server.once('error', async (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && !retryAttempted) {
      retryAttempted = true;
      deps.log(`Port ${deps.port} is already in use, attempting to free it...`);
      try {
        await killProcessOnPort(deps.port);
        deps.log(`Retrying to start server on port ${deps.port}...`);
        // Close the server to reset its state, then retry
        server.close(() => {
          // Wait a bit more to ensure port is fully released
          setTimeout(() => {
            attemptListen();
          }, 300);
        });
      } catch (killError) {
        deps.log(
          `Failed to free port ${deps.port}: ${(killError as Error).message}. Please manually stop the process using port ${deps.port}.`,
        );
        throw new Error(
          `Port ${deps.port} is in use and could not be freed: ${err.message}`,
        );
      }
    } else if (err.code === 'EADDRINUSE') {
      deps.log(`Port ${deps.port} is still in use after retry. Please manually stop the process.`);
      throw err;
    } else {
      throw err;
    }
  });

  attemptListen();
  return server;
}


