/**
 * OPEN-SOURCE STUB — Auth audit returns no findings.
 *
 * Copy this file to `auth-audit.private.ts` to build the project.
 */

export interface ScanFinding {
  category: string;
  severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "INFO";
  title: string;
  description: string;
  evidence: string;
  remediation: string;
}

export async function runAuthAudit(_targetUrl: string): Promise<ScanFinding[]> {
  return [];
}
