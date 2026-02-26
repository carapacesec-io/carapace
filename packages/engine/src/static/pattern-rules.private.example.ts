/**
 * OPEN-SOURCE STUB — No detection rules included.
 *
 * To use Carapace with the full rule set, obtain a license or
 * subscribe at https://carapacesec.io.
 *
 * Copy this file to `pattern-rules.private.ts` to build the project.
 */

import type { Severity } from "../ai/schemas.js";

interface PatternRule {
  id: string;
  title: string;
  description: string;
  suggestion: string;
  pattern: RegExp;
  multilinePattern?: RegExp;
  severity: Severity;
  category: string;
  confidence: "high" | "medium" | "low";
  languages: string[];
  fixTemplate?: string;
  fixFn?: (line: string) => string;
  multilineFixFn?: (matchedText: string) => string;
}

const ALL_RULES: PatternRule[] = [];

export { ALL_RULES };
export type { PatternRule as PrivatePatternRule };
