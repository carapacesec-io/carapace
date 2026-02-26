/**
 * Auth audit module — re-exports from private implementation.
 *
 * The authentication vulnerability assessment logic is proprietary.
 * See auth-audit.private.ts for the implementation.
 */

export type { ScanFinding } from "./auth-audit.private";
export { runAuthAudit } from "./auth-audit.private";
