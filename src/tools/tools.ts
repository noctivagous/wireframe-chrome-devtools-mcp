/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {analyzeJs} from './analyze.js';
import {batchOps} from './batch-ops.js';
import * as consoleTools from './console.js';
import * as diffTools from './diff.js';
import * as editSessionTools from './edit-session.js';
import * as emulationTools from './emulation.js';
import * as extensionTools from './extensions.js';
import * as inputTools from './input.js';
import * as mutationTools from './mutation.js';
import * as networkTools from './network.js';
import * as pagesTools from './pages.js';
import * as performanceTools from './performance.js';
import * as prototypeTools from './prototype.js';
import * as screenshotTools from './screenshot.js';
import * as scriptTools from './script.js';
import * as snapshotTools from './snapshot.js';
import * as stateTools from './state.js';
import type {ToolDefinition} from './ToolDefinition.js';
import {wireframeSnapshot, svgSnapshot} from './wireframe.js';

const tools = [
  analyzeJs,
  batchOps,
  ...Object.values(consoleTools),
  ...Object.values(diffTools),
  ...Object.values(emulationTools),
  ...Object.values(editSessionTools),
  ...Object.values(extensionTools),
  ...Object.values(inputTools),
  ...Object.values(mutationTools),
  ...Object.values(networkTools),
  ...Object.values(pagesTools),
  ...Object.values(performanceTools),
  ...Object.values(prototypeTools),
  ...Object.values(screenshotTools),
  ...Object.values(scriptTools),
  ...Object.values(snapshotTools),
  ...Object.values(stateTools),
  wireframeSnapshot,
  svgSnapshot,
] as ToolDefinition[];

tools.sort((a, b) => {
  return a.name.localeCompare(b.name);
});

export {tools};
