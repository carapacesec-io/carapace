import type { Rule } from "../registry.js";

export const generalRules: Rule[] = [
  {
    id: "gen-code-quality",
    name: "Code Quality",
    description:
      "Identify code smells, overly complex functions, dead code, duplicated logic, and violations of common coding conventions.",
    category: "quality",
    severity: "low",
    enabled: true,
  },
  {
    id: "gen-potential-bugs",
    name: "Potential Bugs",
    description:
      "Detect likely bugs such as off-by-one errors, null/undefined dereferences, incorrect comparisons, unreachable code, and race conditions.",
    category: "bugs",
    severity: "high",
    enabled: true,
  },
  {
    id: "gen-performance",
    name: "Performance",
    description:
      "Flag performance anti-patterns including unnecessary allocations, N+1 queries, missing memoization, and inefficient algorithms.",
    category: "performance",
    severity: "medium",
    enabled: true,
  },
  {
    id: "gen-security",
    name: "Security",
    description:
      "Check for common security vulnerabilities such as injection attacks, insecure deserialization, hardcoded secrets, and missing input validation.",
    category: "security",
    severity: "high",
    enabled: true,
  },
  {
    id: "gen-error-handling",
    name: "Error Handling",
    description:
      "Ensure errors are properly caught, logged, and propagated. Detect swallowed exceptions, generic catch blocks, and missing error boundaries.",
    category: "quality",
    severity: "medium",
    enabled: true,
  },
  {
    id: "gen-type-safety",
    name: "Type Safety",
    description:
      "Identify type safety issues including unsafe casts, implicit any types, missing null checks, and incorrect generic usage.",
    category: "quality",
    severity: "medium",
    enabled: true,
  },
];
