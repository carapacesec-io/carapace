import type { Rule } from "../registry.js";

export const complexityRules: Rule[] = [
  {
    id: "qual-cyclomatic-complexity",
    name: "Cyclomatic Complexity",
    description:
      "Flag functions with high cyclomatic complexity (many branches/conditions) that are hard to test and maintain. Recommend splitting into smaller functions.",
    category: "quality",
    severity: "medium",
    enabled: true,
  },
  {
    id: "qual-function-length",
    name: "Function Length",
    description:
      "Flag functions exceeding 50 lines. Long functions are harder to understand, test, and maintain. Recommend extracting helper functions.",
    category: "quality",
    severity: "low",
    enabled: true,
  },
  {
    id: "qual-nesting-depth",
    name: "Excessive Nesting",
    description:
      "Flag code with nesting depth greater than 4 levels. Deep nesting reduces readability. Recommend guard clauses, early returns, or extraction.",
    category: "quality",
    severity: "medium",
    enabled: true,
  },
  {
    id: "qual-file-size",
    name: "File Size",
    description:
      "Flag files exceeding 500 lines. Large files indicate missing modularization. Recommend splitting into focused, single-responsibility modules.",
    category: "quality",
    severity: "low",
    enabled: true,
  },
];
