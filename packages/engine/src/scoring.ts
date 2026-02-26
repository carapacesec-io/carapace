/**
 * Security score calculator — re-exports from private implementation.
 *
 * The scoring algorithm (deduction weights, tier caps, density normalization)
 * is proprietary. See scoring.private.ts for the implementation.
 */

export type { SecurityScore, Grade } from "./scoring.private.js";
export { computeScore } from "./scoring.private.js";
