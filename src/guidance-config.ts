/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const GUIDANCE_CONFIG_VERSION = 1 as const;
export const GUIDANCE_CONFIG_MAX_BYTES = 400_000;

const GUIDE_KEYS = ['design', 'architecture', 'engineering'] as const;
type GuideKey = (typeof GUIDE_KEYS)[number];

export interface GuidanceGuide {
  title: string;
  format: 'markdown';
  content: string;
}

export interface GuidanceConfigV1 {
  version: 1;
  updatedAt: string;
  guides: Record<GuideKey, GuidanceGuide>;
}

export interface GuidanceConfigInput {
  guides?: Partial<Record<GuideKey, Partial<GuidanceGuide>>>;
}

const DEFAULT_GUIDES: Record<GuideKey, GuidanceGuide> = {
  design: {
    title: 'Design Guide',
    format: 'markdown',
    content: '',
  },
  architecture: {
    title: 'Architecture Guide',
    format: 'markdown',
    content: '',
  },
  engineering: {
    title: 'Engineering Guide',
    format: 'markdown',
    content: '',
  },
};

const DEFAULT_CONFIG: GuidanceConfigV1 = {
  version: 1,
  updatedAt: new Date(0).toISOString(),
  guides: DEFAULT_GUIDES,
};

function getServerDir(): string {
  return path.dirname(fileURLToPath(import.meta.url));
}

export function getDefaultGuidanceConfigPath(): string {
  return path.join(getServerDir(), '.chrome-devtools-mcp-guidance.json');
}

function normalizeGuide(
  input: Partial<GuidanceGuide> | null | undefined,
  fallback: GuidanceGuide,
): GuidanceGuide {
  const title =
    typeof input?.title === 'string' && input.title.trim()
      ? input.title.trim()
      : fallback.title;
  const content = typeof input?.content === 'string' ? input.content : fallback.content;
  return {
    title,
    format: 'markdown',
    content,
  };
}

function normalizeGuides(
  input: GuidanceConfigInput | null | undefined,
  fallback: Record<GuideKey, GuidanceGuide>,
): Record<GuideKey, GuidanceGuide> {
  const guides: Record<GuideKey, GuidanceGuide> = {
    design: fallback.design,
    architecture: fallback.architecture,
    engineering: fallback.engineering,
  };
  const rawGuides = input?.guides ?? null;
  for (const key of GUIDE_KEYS) {
    guides[key] = normalizeGuide(rawGuides?.[key], fallback[key]);
  }
  return guides;
}

function normalizeGuidanceConfig(raw: any): GuidanceConfigV1 {
  const guides = normalizeGuides(raw as GuidanceConfigInput, DEFAULT_GUIDES);
  const updatedAt =
    typeof raw?.updatedAt === 'string' && raw.updatedAt
      ? raw.updatedAt
      : DEFAULT_CONFIG.updatedAt;
  return {
    version: 1,
    updatedAt,
    guides,
  };
}

function ensureGuidanceSize(config: GuidanceConfigV1): void {
  const bytes = Buffer.byteLength(JSON.stringify(config), 'utf8');
  if (bytes > GUIDANCE_CONFIG_MAX_BYTES) {
    throw new Error(
      `Guidance config exceeds ${GUIDANCE_CONFIG_MAX_BYTES} bytes (got ${bytes}).`,
    );
  }
}

export async function loadGuidanceConfig(configPath: string): Promise<{
  configPath: string;
  config: GuidanceConfigV1;
  existed: boolean;
}> {
  const abs = path.resolve(configPath);
  try {
    const raw = await fs.readFile(abs, 'utf8');
    const parsed = JSON.parse(raw) as Partial<GuidanceConfigV1> | null;
    if (!parsed || typeof parsed !== 'object') {
      return {configPath: abs, config: DEFAULT_CONFIG, existed: true};
    }
    if (parsed.version !== 1) {
      return {configPath: abs, config: DEFAULT_CONFIG, existed: true};
    }
    return {
      configPath: abs,
      config: normalizeGuidanceConfig(parsed),
      existed: true,
    };
  } catch {
    return {configPath: abs, config: DEFAULT_CONFIG, existed: false};
  }
}

export async function saveGuidanceConfig(
  configPath: string,
  input: GuidanceConfigInput | null | undefined,
): Promise<GuidanceConfigV1> {
  const abs = path.resolve(configPath);
  const guides = normalizeGuides(input, DEFAULT_GUIDES);
  const next: GuidanceConfigV1 = {
    version: 1,
    updatedAt: new Date().toISOString(),
    guides,
  };
  ensureGuidanceSize(next);
  await fs.mkdir(path.dirname(abs), {recursive: true});
  await fs.writeFile(abs, JSON.stringify(next, null, 2) + '\n', 'utf8');
  return next;
}

