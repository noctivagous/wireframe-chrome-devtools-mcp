/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import './polyfill.js';

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

import type {Channel} from './browser.js';
import {ensureBrowserConnected, ensureBrowserLaunched} from './browser.js';
import {cliOptions, parseArguments} from './cli.js';
import {loadIssueDescriptions} from './issue-descriptions.js';
import {logger, saveLogsToFile} from './logger.js';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import {ClearcutLogger} from './telemetry/clearcut-logger.js';
import {computeFlagUsage} from './telemetry/flag-utils.js';
import {
  McpServer,
  StdioServerTransport,
  type CallToolResult,
  SetLevelRequestSchema,
} from './third_party/index.js';
import {loadToolTogglesConfig, saveToolTogglesConfig, type ToolTogglesConfigV1} from './tool-toggles.js';
import {setBatchOpsExecutor} from './tools/batch-ops.js';
import {ToolCategory} from './tools/categories.js';
import type {ToolDefinition} from './tools/ToolDefinition.js';
import {tools} from './tools/tools.js';
import {startWebUi, type ToolToggleView} from './web-ui.js';

// If moved update release-please config
// x-release-please-start-version
const VERSION = '0.13.0';
// x-release-please-end

export const args = parseArguments(VERSION);

const logFile = args.logFile ? saveLogsToFile(args.logFile) : undefined;
let clearcutLogger: ClearcutLogger | undefined;
if (args.usageStatistics) {
  clearcutLogger = new ClearcutLogger({
    logFile: args.logFile,
    appVersion: VERSION,
  });
}

process.on('unhandledRejection', (reason, promise) => {
  logger('Unhandled promise rejection', promise, reason);
});

logger(`Starting Chrome DevTools MCP Server v${VERSION}`);
const server = new McpServer(
  {
    name: 'chrome_devtools',
    title: 'Chrome DevTools MCP server',
    version: VERSION,
  },
  {capabilities: {logging: {}}},
);
server.server.setRequestHandler(SetLevelRequestSchema, () => {
  return {};
});

let context: McpContext;
async function getContext(): Promise<McpContext> {
  const chromeArgs: string[] = (args.chromeArg ?? []).map(String);
  const ignoreDefaultChromeArgs: string[] = (
    args.ignoreDefaultChromeArg ?? []
  ).map(String);
  if (args.proxyServer) {
    chromeArgs.push(`--proxy-server=${args.proxyServer}`);
  }
  const devtools = args.experimentalDevtools ?? false;
  const browser =
    args.browserUrl || args.wsEndpoint || args.autoConnect
      ? await ensureBrowserConnected({
          browserURL: args.browserUrl,
          wsEndpoint: args.wsEndpoint,
          wsHeaders: args.wsHeaders,
          // Important: only pass channel, if autoConnect is true.
          channel: args.autoConnect ? (args.channel as Channel) : undefined,
          userDataDir: args.userDataDir,
          devtools,
        })
      : await ensureBrowserLaunched({
          headless: args.headless,
          executablePath: args.executablePath,
          channel: args.channel as Channel,
          isolated: args.isolated ?? false,
          userDataDir: args.userDataDir,
          logFile,
          viewport: args.viewport,
          chromeArgs,
          ignoreDefaultChromeArgs,
          acceptInsecureCerts: args.acceptInsecureCerts,
          devtools,
          enableExtensions: args.categoryExtensions,
        });

  if (context?.browser !== browser) {
    context = await McpContext.from(browser, logger, {
      experimentalDevToolsDebugging: devtools,
      experimentalIncludeAllPages: args.experimentalIncludeAllPages,
    });
  }
  return context;
}

async function createIsolatedContext(): Promise<McpContext> {
  const baseContext = await getContext();
  const newContext = await McpContext.from(baseContext.browser, logger, {
    experimentalDevToolsDebugging: args.experimentalDevtools ?? false,
    experimentalIncludeAllPages: args.experimentalIncludeAllPages,
  });
  await newContext.detectOpenDevToolsWindows();
  return newContext;
}

const logDisclaimers = () => {
  console.error(
    `chrome-devtools-mcp exposes content of the browser instance to the MCP clients allowing them to inspect,
debug, and modify any data in the browser or DevTools.
Avoid sharing sensitive or personal information that you do not want to share with MCP clients.`,
  );

  if (args.usageStatistics) {
    console.error(
      `
Google collects usage statistics to improve Chrome DevTools MCP. To opt-out, run with --no-usage-statistics.
For more details, visit: https://github.com/ChromeDevTools/chrome-devtools-mcp#usage-statistics`,
    );
  }
};

const toolMutex = new Mutex();

interface RegisteredTool {
  enabled: boolean;
  enable(): void;
  disable(): void;
}

const registeredTools = new Map<string, {tool: ToolDefinition; handle: RegisteredTool}>();

setBatchOpsExecutor({
  getToolEntry: name => {
    const entry = registeredTools.get(name);
    if (!entry) {
      return undefined;
    }
    return {
      tool: entry.tool,
      enabled: entry.handle.enabled,
    };
  },
  createIsolatedContext,
  experimentalStructuredContent: Boolean(args.experimentalStructuredContent),
});

/**
 * Find the project root directory (where package.json is located).
 * Walks up from the current file's directory until it finds package.json.
 */
function findProjectRoot(): string {
  let currentDir = path.dirname(fileURLToPath(import.meta.url));
  // Walk up from src/main.ts -> project root
  while (currentDir !== path.dirname(currentDir)) {
    const packageJsonPath = path.join(currentDir, 'package.json');
    if (fs.existsSync(packageJsonPath)) {
      return currentDir;
    }
    currentDir = path.dirname(currentDir);
  }
  // Fallback to process.cwd() if we can't find package.json
  return process.cwd();
}

const projectRoot = findProjectRoot();

/**
 * Project documentation and workflow guidance exposed as MCP Resources + Prompts.
 *
 * Why:
 * - Resources are ideal for static/semi-static docs like README/USAGE_GUIDE.
 * - Prompts provide reusable workflow templates aligned with USAGE_GUIDE.md.
 */
const projectDocResources: Array<{
  uri: string;
  name: string;
  description: string;
  mimeType: string;
  filePath: string;
}> = [
  {
    uri: 'project://repo/README.md',
    name: 'README',
    description: 'Project overview, tool inventory, configuration, and concepts.',
    mimeType: 'text/markdown',
    filePath: path.join(projectRoot, 'README.md'),
  },
  {
    uri: 'project://repo/USAGE_GUIDE.md',
    name: 'USAGE_GUIDE',
    description:
      'How to use this MCP server: recommended workflows (live edit sessions, commits, debugging).',
    mimeType: 'text/markdown',
    filePath: path.join(projectRoot, 'USAGE_GUIDE.md'),
  },
  {
    uri: 'project://repo/docs/tool-reference.md',
    name: 'Tool reference',
    description: 'Full tool reference for all MCP tools exposed by this server.',
    mimeType: 'text/markdown',
    filePath: path.join(projectRoot, 'docs', 'tool-reference.md'),
  },
  {
    uri: 'project://repo/docs/tool-toggles-ui.md',
    name: 'Tool toggles UI',
    description: 'Docs for the local web UI used to enable/disable tools.',
    mimeType: 'text/markdown',
    filePath: path.join(projectRoot, 'docs', 'tool-toggles-ui.md'),
  },
  {
    uri: 'project://repo/reports/software-guidance-report.md',
    name: 'Software guidance report',
    description:
      'Project proposal for design/architecture/engineering guidance and how to integrate it with the web UI.',
    mimeType: 'text/markdown',
    filePath: path.join(projectRoot, 'reports', 'software-guidance-report.md'),
  },
];

for (const r of projectDocResources) {
  server.registerResource(
    r.name,
    r.uri,
    {
      title: r.name,
      description: r.description,
      mimeType: r.mimeType,
    },
    async () => {
      const text = await fs.promises.readFile(r.filePath, 'utf8');
      return {
        contents: [
          {
            uri: r.uri,
            mimeType: r.mimeType,
            text,
          },
        ],
      };
    },
  );
}

server.registerPrompt(
  'workflow_live_edit_session',
  {
    title: 'Workflow: Live edit session (iterate in browser, then commit)',
    description:
      'Start an edit session, iterate live with recordToSession, then preview and apply a commit plan.',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            'Follow the project live-edit workflow.\n' +
            '\n' +
            '- Read the workflow docs if needed: project://repo/USAGE_GUIDE.md\n' +
            '- Start: begin_edit_session\n' +
            '- Make changes using insert_css / insert_js / manipulate_dom with recordToSession: true\n' +
            '  - Or use batch_ops for applying multiple changes at once\n' +
            '  - Use insert_css_preview / insert_js_preview for testing multiple variants (automatic rollback)\n' +
            '  - Use insert_css / insert_js when you want to keep the final change applied\n' +
            '- Use svg_snapshot / wireframe_snapshot to verify layout\n' +
            '- Preview exactly what will be written: preview_commit_plan\n' +
            '- Only when approved: apply_commit_plan\n' +
            '  - Alternative: commit_edit_session_to_files (best-effort append, less safe)\n' +
            '  - Alternative: export_edit_session_package (no file writes, for review)\n' +
            '\n' +
            'Important: keep changes live-in-browser until explicitly committing; do not write repo files unless asked.',
        },
      },
    ],
  }),
);

server.registerPrompt(
  'workflow_debug_layout_then_fix',
  {
    title: 'Workflow: Debug layout (wireframes) then fix',
    description:
      'Use svg_snapshot/wireframe_snapshot to find overlaps/gaps, test fixes live, and commit the final patch.',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            'Debug layout issues using wireframe tools, then fix safely.\n' +
            '\n' +
            '- Use svg_snapshot and wireframe_snapshot to identify overlaps, overflow, and gaps.\n' +
            '- Start an edit session (begin_edit_session) and apply candidate fixes with recordToSession: true.\n' +
            '- Compare before/after snapshots.\n' +
            '- When the fix is correct, preview_commit_plan and only then apply_commit_plan to write changes.\n' +
            '\n' +
            'If you need the canonical workflow details, read: project://repo/USAGE_GUIDE.md',
        },
      },
    ],
  }),
);

server.registerPrompt(
  'workflow_export_session_package',
  {
    title: 'Workflow: Export edit session as a package (no file writes)',
    description:
      'Iterate live and export an edit session package for review without modifying repo files.',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            'Iterate live, but do not write repo files. Export a reviewable package instead.\n' +
            '\n' +
            '- begin_edit_session\n' +
            '- Make changes with recordToSession: true\n' +
            '- (Optional) summarize_edit_session for a human-readable summary\n' +
            '- export_edit_session_package to a folder path\n' +
            '\n' +
            'Confirm: no apply_commit_plan / commit_edit_session_to_files unless explicitly requested.',
        },
      },
    ],
  }),
);

server.registerPrompt(
  'workflow_build_prototype_from_scratch',
  {
    title: 'Workflow: Build prototype from scratch',
    description:
      'Start with a blank page and build a complete prototype using live editing and commits.',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            'Build a prototype from scratch using live editing.\n' +
            '\n' +
            '- Read the workflow docs if needed: project://repo/USAGE_GUIDE.md\n' +
            '- Start with a blank page (navigate to about:blank or empty HTML)\n' +
            '- begin_edit_session\n' +
            '- Build components step by step using insert_css / insert_js / manipulate_dom with recordToSession: true\n' +
            '  - Or use batch_ops for applying multiple styling/layout changes at once\n' +
            '  - Create navigation bar with logo and menu items\n' +
            '  - Add hero section with centered text and CTA button\n' +
            '  - Add content sections, forms, or other components\n' +
            '- Use svg_snapshot / wireframe_snapshot to verify layout at each step\n' +
            '- Preview the complete result: preview_commit_plan\n' +
            '- Apply to specific files: apply_commit_plan\n' +
            '\n' +
            'Important: build iteratively in browser, then commit clean patches when complete.',
        },
      },
    ],
  }),
);

server.registerPrompt(
  'workflow_chatbox_iteration',
  {
    title: 'Workflow: Chatbox iteration (in-browser chat)',
    description:
      'Use the in-browser chatbox for rapid iteration with instant visual feedback.',
  },
  () => ({
    messages: [
      {
        role: 'user',
        content: {
          type: 'text',
          text:
            'Use in-browser chatbox for rapid iteration.\n' +
            '\n' +
            '- Read the workflow docs if needed: project://repo/USAGE_GUIDE.md\n' +
            '- Start: begin_edit_session with chatbox (inject_chatbox)\n' +
            '- In browser chatbox: make changes using chatbox_step\n' +
            '  - Example: "Make the cards wider", "Add more padding between sections"\n' +
            '  - Changes apply instantly in browser\n' +
            '- In IDE: commit this session to files when satisfied\n' +
            '\n' +
            'This workflow provides the fastest feedback loop - changes happen immediately in the browser.',
        },
      },
    ],
  }),
);

const toolConfigPath = path.resolve(
  (args as any).toolConfig ?? path.join(projectRoot, '.chrome-devtools-mcp-tools.json'),
);
const {config: loadedConfig, existed} = await loadToolTogglesConfig(toolConfigPath);
let toolToggles: ToolTogglesConfigV1 = loadedConfig;

// Create default config file in project root if it doesn't exist (so it can be tracked in git)
if (!existed && !(args as any).toolConfig) {
  await saveToolTogglesConfig(toolConfigPath, []);
  toolToggles = (await loadToolTogglesConfig(toolConfigPath)).config;
}

function registerTool(tool: ToolDefinition): void {
  if (
    tool.annotations.category === ToolCategory.EMULATION &&
    args.categoryEmulation === false
  ) {
    return;
  }
  if (
    tool.annotations.category === ToolCategory.PERFORMANCE &&
    args.categoryPerformance === false
  ) {
    return;
  }
  if (
    tool.annotations.category === ToolCategory.NETWORK &&
    args.categoryNetwork === false
  ) {
    return;
  }
  if (
    tool.annotations.category === ToolCategory.EXTENSIONS &&
    args.categoryExtensions === false
  ) {
    return;
  }
  if (
    tool.annotations.conditions?.includes('computerVision') &&
    !args.experimentalVision
  ) {
    return;
  }
  if (
    tool.annotations.conditions?.includes('experimentalInteropTools') &&
    !args.experimentalInteropTools
  ) {
    return;
  }
  const handle = server.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.schema,
      annotations: tool.annotations,
    },
    async (params): Promise<CallToolResult> => {
      const guard = await toolMutex.acquire();
      const startTime = Date.now();
      let success = false;
      try {
        logger(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);
        const context = await getContext();
        logger(`${tool.name} context: resolved`);
        await context.detectOpenDevToolsWindows();
        const response = new McpResponse();
        await tool.handler(
          {
            params,
          },
          response,
          context,
        );
        const {content, structuredContent} = await response.handle(
          tool.name,
          context,
        );
        const result: CallToolResult & {
          structuredContent?: Record<string, unknown>;
        } = {
          content,
        };
        success = true;
        if (args.experimentalStructuredContent) {
          result.structuredContent = structuredContent as Record<
            string,
            unknown
          >;
        }
        return result;
      } catch (err) {
        logger(`${tool.name} error:`, err, err?.stack);
        let errorText = err && 'message' in err ? err.message : String(err);
        if ('cause' in err && err.cause) {
          errorText += `\nCause: ${err.cause.message}`;
        }
        return {
          content: [
            {
              type: 'text',
              text: errorText,
            },
          ],
          isError: true,
        };
      } finally {
        void clearcutLogger?.logToolInvocation({
          toolName: tool.name,
          success,
          latencyMs: Date.now() - startTime,
        });
        guard.dispose();
      }
    },
  );
  registeredTools.set(tool.name, {tool, handle: handle as unknown as RegisteredTool});
}

for (const tool of tools) {
  registerTool(tool);
}

// Apply persisted toggles before connecting (avoids noisy list_changed notifications at startup).
{
  const disabled = new Set(toolToggles.disabledTools ?? []);
  for (const [name, entry] of registeredTools.entries()) {
    if (disabled.has(name)) {
      entry.handle.disable();
    }
  }
}

await loadIssueDescriptions();
const transport = new StdioServerTransport();
await server.connect(transport);
logger('Chrome DevTools MCP Server connected');
logDisclaimers();
void clearcutLogger?.logDailyActiveIfNeeded();
void clearcutLogger?.logServerStart(computeFlagUsage(args, cliOptions));

// Optional local web UI for tool toggles (persistent JSON on disk).
if ((args as any).webUi) {
  const host = String((args as any).webUiHost ?? '127.0.0.1');
  const port = Number((args as any).webUiPort ?? 7332);

  startWebUi({
    host,
    port,
    log: logger,
    getConfigMeta: () => ({configPath: toolConfigPath, updatedAt: toolToggles.updatedAt}),
    getTools: (): ToolToggleView[] => {
      return Array.from(registeredTools.values()).map(({tool, handle}) => ({
        name: tool.name,
        description: tool.description,
        category: String(tool.annotations.category ?? 'unknown'),
        enabled: Boolean(handle.enabled),
      }));
    },
    setDisabledTools: async (disabledTools: string[]) => {
      toolToggles = await saveToolTogglesConfig(toolConfigPath, disabledTools);
      const disabled = new Set(toolToggles.disabledTools);
      for (const [name, entry] of registeredTools.entries()) {
        const shouldEnable = !disabled.has(name);
        if (shouldEnable && !entry.handle.enabled) {entry.handle.enable();}
        if (!shouldEnable && entry.handle.enabled) {entry.handle.disable();}
      }
    },
  });
}
