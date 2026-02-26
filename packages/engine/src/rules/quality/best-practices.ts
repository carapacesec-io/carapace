import type { Rule } from "../registry.js";

export const bestPracticeRules: Rule[] = [
  {
    id: "qual-error-handling",
    name: "Error Handling",
    description:
      "Flag missing error handling patterns: uncaught async errors, generic catch blocks, missing error propagation, and swallowed promise rejections.",
    category: "quality",
    severity: "medium",
    enabled: true,
  },
  {
    id: "qual-event-emission",
    name: "Missing Event Emission",
    description:
      "Flag Solidity state-changing functions that don't emit events. Events are critical for off-chain monitoring, indexing, and frontend updates.",
    category: "quality",
    chain: "solidity",
    severity: "medium",
    enabled: true,
  },
  {
    id: "qual-natspec",
    name: "Missing NatSpec Documentation",
    description:
      "Flag public/external Solidity functions missing NatSpec documentation (@notice, @param, @return). Documentation is critical for auditors and integrators.",
    category: "quality",
    chain: "solidity",
    severity: "low",
    enabled: true,
  },
  {
    id: "qual-immutable-usage",
    name: "Immutable Usage",
    description:
      "Flag Solidity state variables set once in constructor that should use the immutable keyword. Immutable saves gas by embedding values in bytecode.",
    category: "gas",
    chain: "solidity",
    severity: "low",
    enabled: true,
  },
];
