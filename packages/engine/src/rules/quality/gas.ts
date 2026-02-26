import type { Rule } from "../registry.js";

export const gasRules: Rule[] = [
  {
    id: "qual-storage-vs-memory",
    name: "Storage vs Memory Optimization",
    description:
      "Flag unnecessary SSTORE/SLOAD operations in Solidity. Reading storage in loops, redundant storage reads, and opportunities to cache in memory.",
    category: "gas",
    chain: "solidity",
    severity: "medium",
    enabled: true,
  },
  {
    id: "qual-loop-optimization",
    name: "Loop Optimization",
    description:
      "Flag gas-inefficient loop patterns: unbounded loops, array length recomputation, storage reads inside loops, and missing loop invariant hoisting.",
    category: "gas",
    chain: "solidity",
    severity: "medium",
    enabled: true,
  },
  {
    id: "qual-struct-packing",
    name: "Struct Packing",
    description:
      "Flag suboptimal struct field ordering that wastes storage slots. Adjacent small types (uint8, bool, address) should be packed into single slots.",
    category: "gas",
    chain: "solidity",
    severity: "low",
    enabled: true,
  },
  {
    id: "qual-calldata-vs-memory",
    name: "Calldata vs Memory",
    description:
      "Flag external function parameters using memory instead of calldata. Calldata is cheaper for read-only parameters, especially on L2s like Base.",
    category: "gas",
    chain: "solidity",
    severity: "low",
    enabled: true,
  },
];
