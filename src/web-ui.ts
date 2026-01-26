/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {exec} from 'node:child_process';
import http from 'node:http';
import {URL} from 'node:url';
import {promisify} from 'node:util';

import {htmlPage, type PageRoute} from './web-ui-template.js';
import type {GuidanceConfigInput, GuidanceConfigV1} from './guidance-config.js';

const execAsync = promisify(exec);

export interface ParameterInfo {
  type: string;
  required: boolean;
  description?: string;
  enum?: string[];
}

export interface ToolToggleView {
  name: string;
  description: string;
  category: string;
  enabled: boolean;
  isOriginal?: boolean;
  parameters?: Record<string, ParameterInfo>;
}

export interface WebUiDeps {
  host: string;
  port: number;
  getTools(): ToolToggleView[];
  getConfigMeta(): {configPath: string; updatedAt: string};
  getGuidance(): {configPath: string; config: GuidanceConfigV1};
  setDisabledTools(disabledTools: string[]): Promise<void>;
  setGuidance(input: GuidanceConfigInput): Promise<GuidanceConfigV1>;
  log: (...args: any[]) => void;
}

/**
 * Original tools from the official Chrome DevTools MCP repository.
 * This list is based on the tool-reference.md from:
 * https://github.com/ChromeDevTools/chrome-devtools-mcp
 * 
 * Last verified: 2026-01-22
 */
const ORIGINAL_TOOLS = new Set([
  // Input automation (8 tools)
  'click',
  'drag',
  'fill',
  'fill_form',
  'handle_dialog',
  'hover',
  'press_key',
  'upload_file',
  
  // Navigation automation (6 tools)
  'close_page',
  'list_pages',
  'navigate_page',
  'new_page',
  'select_page',
  'wait_for',
  
  // Emulation (2 tools)
  'emulate',
  'resize_page',
  
  // Performance (3 tools)
  'performance_analyze_insight',
  'performance_start_trace',
  'performance_stop_trace',
  
  // Network (2 tools)
  'get_network_request',
  'list_network_requests',
  
  // Debugging (5 tools)
  'evaluate_script',
  'get_console_message',
  'list_console_messages',
  'take_screenshot',
  'take_snapshot',
]);

/**
 * Determines if a tool is from the original chrome-devtools-mcp repository
 * based on the official tool list.
 */
export function isOriginalTool(toolName: string): boolean {
  return ORIGINAL_TOOLS.has(toolName);
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
  if (!text) {return null;}
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
      
      // Route handling for different pages
      if (req.method === 'GET') {
        let route: PageRoute | null = null;
        
        // Determine route from pathname
        if (url.pathname === '/' || url.pathname === '/index.html') {
          route = 'index';
        } else if (url.pathname === '/tools' || url.pathname === '/tools.html') {
          route = 'tools';
        } else if (url.pathname === '/guidance' || url.pathname === '/guidance.html') {
          route = 'guidance';
        } else if (url.pathname === '/workflows' || url.pathname === '/workflows.html') {
          route = 'workflows';
        } else {
          // Check for workflow routes: /workflow/:workflowId
          const workflowMatch = url.pathname.match(/^\/workflow\/([^\/]+)(\/)?$/);
          if (workflowMatch) {
            route = {type: 'workflow', workflowId: workflowMatch[1]};
          } else {
            // For any other path, try to serve as HTML page
            const pathMatch = url.pathname.match(/^\/([^\/]+)(\.html)?$/);
            if (pathMatch) {
              const pageName = pathMatch[1];
              if (['tools', 'guidance', 'workflows', 'index'].includes(pageName)) {
                route = pageName as PageRoute;
              }
            }
          }
        }
        
        // Serve HTML page if it's a page route
        if (route !== null) {
          const body = htmlPage(route);
          res.writeHead(200, {
            'content-type': 'text/html; charset=utf-8',
            'cache-control': 'no-store',
          });
          res.end(body);
          return;
        }
      }

      if (req.method === 'GET' && url.pathname === '/api/tools') {
        const meta = deps.getConfigMeta();
        const tools = deps.getTools().map(tool => ({
          ...tool,
          // Override isOriginal based on the official tool list
          isOriginal: tool.isOriginal ?? isOriginalTool(tool.name),
        }));
        return sendJson(res, 200, {
          tools,
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

      if (req.method === 'GET' && url.pathname === '/api/guidance') {
        const guidance = deps.getGuidance();
        return sendJson(res, 200, {
          ...guidance.config,
          configPath: guidance.configPath,
        });
      }

      if (req.method === 'POST' && url.pathname === '/api/guidance') {
        try {
          const body = await readJsonBody(req);
          const next = await deps.setGuidance(body);
          return sendJson(res, 200, {ok: true, updatedAt: next.updatedAt});
        } catch (e) {
          return sendJson(res, 400, {
            ok: false,
            error: String((e as Error)?.message ?? e),
          });
        }
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
