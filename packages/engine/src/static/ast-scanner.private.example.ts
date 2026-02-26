/**
 * OPEN-SOURCE STUB — AST scanner returns no findings.
 *
 * Copy this file to `ast-scanner.private.ts` to build the project.
 * For AST-based code quality checks, obtain a license at https://carapacesec.io.
 */

import type { StaticFinding } from "./types.js";

export function scanFileAST(
  _relPath: string,
  _content: string,
  _changedRanges: [number, number][] | undefined,
): StaticFinding[] {
  return [];
}
