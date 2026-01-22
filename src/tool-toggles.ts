/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';

export interface ToolTogglesConfigV1 {
  version: 1;
  updatedAt: string; // ISO
  /**
   * Tools that should be disabled (anything not listed is enabled by default).
   * Using a denylist means newly added tools default to enabled.
   */
  disabledTools: string[];
}

const DEFAULT_CONFIG: ToolTogglesConfigV1 = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  disabledTools: [],
};

export async function loadToolTogglesConfig(configPath: string): Promise<{
  configPath: string;
  config: ToolTogglesConfigV1;
  existed: boolean;
}> {
  const abs = path.resolve(configPath);
  try {
    const raw = await fs.readFile(abs, 'utf8');
    const parsed = JSON.parse(raw) as Partial<ToolTogglesConfigV1> | null;
    if (!parsed || typeof parsed !== 'object') {
      return {configPath: abs, config: DEFAULT_CONFIG, existed: true};
    }
    if (parsed.version !== 1) {
      // Future-proof: unknown version -> treat as default rather than crashing.
      return {configPath: abs, config: DEFAULT_CONFIG, existed: true};
    }
    const disabledTools = Array.isArray(parsed.disabledTools)
      ? parsed.disabledTools.filter(x => typeof x === 'string')
      : [];
    const updatedAt =
      typeof parsed.updatedAt === 'string' && parsed.updatedAt
        ? parsed.updatedAt
        : DEFAULT_CONFIG.updatedAt;
    return {
      configPath: abs,
      config: {version: 1, updatedAt, disabledTools},
      existed: true,
    };
  } catch (e) {
    // Missing file is normal.
    return {configPath: abs, config: DEFAULT_CONFIG, existed: false};
  }
}

export async function saveToolTogglesConfig(
  configPath: string,
  disabledTools: string[],
): Promise<ToolTogglesConfigV1> {
  const abs = path.resolve(configPath);
  await fs.mkdir(path.dirname(abs), {recursive: true});
  const next: ToolTogglesConfigV1 = {
    version: 1,
    updatedAt: new Date().toISOString(),
    disabledTools: [...new Set(disabledTools.filter(x => typeof x === 'string' && x))].sort(),
  };
  await fs.writeFile(abs, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}


