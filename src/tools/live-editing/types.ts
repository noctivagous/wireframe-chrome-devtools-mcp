/**
 * @license
 * Copyright 2026
 * SPDX-License-Identifier: Apache-2.0
 */

import type {Context, Response} from '../ToolDefinition.js';

export const LIVE_EDITING_SCHEMA_VERSION = 1 as const;

export type LiveEditingResponseKind =
  | 'live_editing_snapshot'
  | 'live_editing_session'
  | 'live_editing_update';

export type ArtifactMimeType = Parameters<Context['saveTemporaryFile']>[1];

export interface LiveEditingArtifact {
  filename: string;
  mimeType: ArtifactMimeType;
  byteLength: number;
  summary?: string;
}

export interface LiveEditingInstructions {
  goals?: string[];
  ordered_steps?: string[];
  constraints?: string[];
  cautions?: string[];
}

export interface LiveEditingToolCall {
  tool: string;
  args: Record<string, unknown>;
}

export interface LiveEditingToolResponse<Data = unknown, BatchOps = unknown> {
  kind: LiveEditingResponseKind;
  version: typeof LIVE_EDITING_SCHEMA_VERSION;
  data: Data;
  artifacts: LiveEditingArtifact[];
  instructions?: LiveEditingInstructions;
  next_tool_calls?: LiveEditingToolCall[];
  batch_ops_plan?: BatchOps;
}

export function appendLiveEditingResponse(
  response: Response,
  payload: LiveEditingToolResponse,
) {
  response.appendResponseLine('```json');
  response.appendResponseLine(JSON.stringify(payload, null, 2));
  response.appendResponseLine('```');
}

export interface ArtifactOutput<T> {
  artifact?: LiveEditingArtifact;
  inline?: T;
  inlineSkipped?: {reason: string; maxBytesInline: number; byteLength: number};
  effectiveOutputMode: 'summary' | 'inline' | 'file';
}

export async function resolveArtifactOutput<T>(options: {
  context: Context;
  bytes: Uint8Array<ArrayBufferLike>;
  mimeType: ArtifactMimeType;
  baseName: string;
  outputMode: 'summary' | 'inline' | 'file';
  maxBytesInline: number;
  filePath?: string;
  inlineData?: T;
  summary?: string;
}): Promise<ArtifactOutput<T>> {
  const {
    context,
    bytes,
    mimeType,
    baseName,
    outputMode,
    maxBytesInline,
    filePath,
    inlineData,
    summary,
  } = options;

  if (filePath) {
    const file = await context.saveFile(bytes, filePath);
    return {
      artifact: {
        filename: file.filename,
        mimeType,
        byteLength: bytes.length,
        summary,
      },
      effectiveOutputMode: 'file',
    };
  }

  if (outputMode === 'inline') {
    if (bytes.length <= maxBytesInline && typeof inlineData !== 'undefined') {
      return {
        inline: inlineData,
        effectiveOutputMode: 'inline',
      };
    }
    const {filename} = await context.saveTemporaryFile(bytes, mimeType, baseName);
    return {
      artifact: {
        filename,
        mimeType,
        byteLength: bytes.length,
        summary,
      },
      inlineSkipped: {
        reason:
          typeof inlineData === 'undefined' ? 'inlineDataUnavailable' : 'maxBytesInlineExceeded',
        maxBytesInline,
        byteLength: bytes.length,
      },
      effectiveOutputMode: 'summary',
    };
  }

  const {filename} = await context.saveTemporaryFile(bytes, mimeType, baseName);
  return {
    artifact: {
      filename,
      mimeType,
      byteLength: bytes.length,
      summary,
    },
    effectiveOutputMode: outputMode === 'file' ? 'file' : 'summary',
  };
}

