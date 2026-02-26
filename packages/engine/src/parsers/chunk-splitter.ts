/**
 * Chunk splitter.
 *
 * Splits a list of parsed diff files into chunks that fit within a given
 * token budget so each chunk can be sent to the AI model independently.
 *
 * Token estimation: 1 token ~ 4 characters.
 */

import type { DiffFile, DiffHunk } from "./diff-parser.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DiffChunk {
  /** Files (or partial files) included in this chunk. */
  files: DiffFile[];
  /** Estimated token count for this chunk. */
  estimatedTokens: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3);
}

function serializeHunk(hunk: DiffHunk): string {
  const header = `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@\n`;
  const body = hunk.changes
    .map((c) => {
      const prefix = c.type === "add" ? "+" : c.type === "delete" ? "-" : " ";
      return `${prefix}${c.content}`;
    })
    .join("\n");
  return header + body;
}

function serializeFile(file: DiffFile): string {
  const header = `--- a/${file.oldPath}\n+++ b/${file.path}\n`;
  const hunks = file.hunks.map(serializeHunk).join("\n");
  return header + hunks;
}

function fileTokens(file: DiffFile): number {
  return estimateTokens(serializeFile(file));
}

function hunkTokens(hunk: DiffHunk): number {
  return estimateTokens(serializeHunk(hunk));
}

// ---------------------------------------------------------------------------
// Splitter
// ---------------------------------------------------------------------------

export function splitIntoChunks(
  files: DiffFile[],
  maxChunkTokens: number,
): DiffChunk[] {
  const chunks: DiffChunk[] = [];
  let currentFiles: DiffFile[] = [];
  let currentTokens = 0;

  for (const file of files) {
    const fileTok = fileTokens(file);

    // If the entire file fits into the current chunk, add it.
    if (currentTokens + fileTok <= maxChunkTokens) {
      currentFiles.push(file);
      currentTokens += fileTok;
      continue;
    }

    // If the current chunk already has files, flush it.
    if (currentFiles.length > 0) {
      chunks.push({ files: currentFiles, estimatedTokens: currentTokens });
      currentFiles = [];
      currentTokens = 0;
    }

    // If the whole file fits in an empty chunk, just add it.
    if (fileTok <= maxChunkTokens) {
      currentFiles.push(file);
      currentTokens = fileTok;
      continue;
    }

    // The file is larger than a single chunk. Split by hunks.
    // Each hunk-group becomes its own chunk, keeping the file metadata.
    const fileHeaderTokens = estimateTokens(
      `--- a/${file.oldPath}\n+++ b/${file.path}\n`,
    );

    let hunkBatch: DiffHunk[] = [];
    let batchTokens = fileHeaderTokens;

    for (const hunk of file.hunks) {
      const hTok = hunkTokens(hunk);

      if (batchTokens + hTok <= maxChunkTokens) {
        hunkBatch.push(hunk);
        batchTokens += hTok;
      } else {
        // Flush current hunk batch
        if (hunkBatch.length > 0) {
          chunks.push({
            files: [{ ...file, hunks: hunkBatch }],
            estimatedTokens: batchTokens,
          });
        }
        hunkBatch = [hunk];
        batchTokens = fileHeaderTokens + hTok;
      }
    }

    // Flush remaining hunks
    if (hunkBatch.length > 0) {
      chunks.push({
        files: [{ ...file, hunks: hunkBatch }],
        estimatedTokens: batchTokens,
      });
    }
  }

  // Flush remaining files
  if (currentFiles.length > 0) {
    chunks.push({ files: currentFiles, estimatedTokens: currentTokens });
  }

  return chunks;
}
