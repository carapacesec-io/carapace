/**
 * Rule registry.
 *
 * Central catalogue of all available review rules. Consumers select rules by
 * chain or ruleset category when starting a review.
 */

import type { Severity } from "../ai/schemas.js";
import { solidityRules } from "./crypto/solidity.js";
import { generalRules } from "./general/index.js";
import { reconRules, authRules, injectionRules, apiRules } from "./attack/index.js";
import { complexityRules, namingRules, deadCodeRules, gasRules, bestPracticeRules } from "./quality/index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Rule {
  id: string;
  name: string;
  description: string;
  category: string;
  chain?: string;
  severity: Severity;
  enabled: boolean;
}

// ---------------------------------------------------------------------------
// All rules flattened
// ---------------------------------------------------------------------------

const ALL_RULES: Rule[] = [
  ...generalRules,
  ...solidityRules,
  ...reconRules,
  ...authRules,
  ...injectionRules,
  ...apiRules,
  ...complexityRules,
  ...namingRules,
  ...deadCodeRules,
  ...gasRules,
  ...bestPracticeRules,
];

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns every registered rule.
 */
export function getAllRules(): Rule[] {
  return ALL_RULES;
}

/**
 * Returns rules relevant to the given set of chains, plus all general
 * (chain-agnostic) rules.
 */
export function getRulesForChains(chains: string[]): Rule[] {
  const chainSet = new Set(chains);
  return ALL_RULES.filter((rule) => {
    // Always include general rules (no chain specified)
    if (!rule.chain) return true;
    return chainSet.has(rule.chain);
  });
}
