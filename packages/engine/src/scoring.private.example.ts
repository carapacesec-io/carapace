/**
 * OPEN-SOURCE STUB — Basic scoring without proprietary algorithm.
 *
 * Copy this file to `scoring.private.ts` to build the project.
 * For the full scoring algorithm, obtain a license at https://carapacesec.io.
 */

import type { Finding, Severity } from "./ai/schemas.js";

export type Grade = "A" | "B" | "C" | "D" | "F";

export interface SecurityScore {
  score: number;
  grade: Grade;
  breakdown: Record<Severity, { count: number; deducted: number }>;
}

export function computeScore(
  findings: Finding[],
  _fileCount?: number,
): SecurityScore {
  const breakdown: Record<Severity, { count: number; deducted: number }> = {
    critical: { count: 0, deducted: 0 },
    high: { count: 0, deducted: 0 },
    medium: { count: 0, deducted: 0 },
    low: { count: 0, deducted: 0 },
    info: { count: 0, deducted: 0 },
  };

  for (const f of findings) {
    breakdown[f.severity].count += 1;
    breakdown[f.severity].deducted += f.severity === "critical" ? 15 : f.severity === "high" ? 8 : f.severity === "medium" ? 3 : 1;
  }

  let total = 0;
  for (const sev of ["critical", "high", "medium", "low", "info"] as Severity[]) {
    total += breakdown[sev].deducted;
  }

  const score = Math.max(0, Math.min(100, Math.round(100 - total)));
  let grade: Grade;
  if (score >= 90) grade = "A";
  else if (score >= 80) grade = "B";
  else if (score >= 70) grade = "C";
  else if (score >= 55) grade = "D";
  else grade = "F";

  return { score, grade, breakdown };
}
