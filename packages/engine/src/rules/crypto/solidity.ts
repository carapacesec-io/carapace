import type { Rule } from "../registry.js";

export const solidityRules: Rule[] = [
  {
    id: "sol-reentrancy",
    name: "Reentrancy",
    description:
      "Detect reentrancy vulnerabilities where external calls are made before state updates, potentially allowing attackers to re-enter the function.",
    category: "security",
    chain: "solidity",
    severity: "critical",
    enabled: true,
  },
  {
    id: "sol-access-control",
    name: "Access Control",
    description:
      "Ensure sensitive functions are protected with appropriate access control modifiers (onlyOwner, role-based, etc.) and cannot be called by unauthorized parties.",
    category: "security",
    chain: "solidity",
    severity: "critical",
    enabled: true,
  },
  {
    id: "sol-gas-optimization",
    name: "Gas Optimization",
    description:
      "Identify gas-inefficient patterns such as unnecessary storage reads, unbounded loops, redundant computations, and suboptimal data packing.",
    category: "performance",
    chain: "solidity",
    severity: "medium",
    enabled: true,
  },
  {
    id: "sol-integer-overflow",
    name: "Integer Overflow",
    description:
      "Flag potential integer overflow/underflow issues, especially in Solidity versions < 0.8.0 without SafeMath, or in unchecked blocks.",
    category: "security",
    chain: "solidity",
    severity: "high",
    enabled: true,
  },
  {
    id: "sol-flash-loan",
    name: "Flash Loan Attack",
    description:
      "Detect patterns vulnerable to flash loan exploits, including price manipulation via single-block oracle reads and unprotected liquidity assumptions.",
    category: "security",
    chain: "solidity",
    severity: "critical",
    enabled: true,
  },
  {
    id: "sol-oracle-manipulation",
    name: "Oracle Manipulation",
    description:
      "Identify oracle usage patterns susceptible to manipulation, such as spot price reliance, missing staleness checks, or single-source price feeds.",
    category: "security",
    chain: "solidity",
    severity: "critical",
    enabled: true,
  },
  {
    id: "sol-front-running-mev",
    name: "Front-Running / MEV",
    description:
      "Detect code patterns vulnerable to front-running or MEV extraction, including unprotected swap operations and missing slippage parameters.",
    category: "security",
    chain: "solidity",
    severity: "high",
    enabled: true,
  },
  {
    id: "sol-unchecked-return",
    name: "Unchecked Return Values",
    description:
      "Flag low-level calls (.call, .send, .transfer) and ERC-20 transfer/approve calls whose return values are not checked.",
    category: "security",
    chain: "solidity",
    severity: "high",
    enabled: true,
  },
  {
    id: "sol-tx-origin",
    name: "tx.origin Usage",
    description:
      "Warn against using tx.origin for authorization, which can be exploited via phishing contracts to impersonate the original sender.",
    category: "security",
    chain: "solidity",
    severity: "high",
    enabled: true,
  },
  {
    id: "sol-delegatecall-safety",
    name: "Delegatecall Safety",
    description:
      "Check for unsafe delegatecall usage, especially to user-controlled addresses, which can allow arbitrary code execution in the caller's context.",
    category: "security",
    chain: "solidity",
    severity: "critical",
    enabled: true,
  },
];
