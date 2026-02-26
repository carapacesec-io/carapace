import type { Rule } from "../registry.js";

export const namingRules: Rule[] = [
  {
    id: "qual-naming-convention",
    name: "Naming Convention",
    description:
      "Enforce consistent naming conventions — camelCase for variables/functions, PascalCase for types/classes, UPPER_SNAKE for constants.",
    category: "quality",
    severity: "low",
    enabled: true,
  },
  {
    id: "qual-magic-numbers",
    name: "Magic Numbers",
    description:
      "Flag unexplained numeric literals in code. Magic numbers reduce readability and maintainability. Recommend extracting to named constants.",
    category: "quality",
    severity: "low",
    enabled: true,
  },
  {
    id: "qual-unclear-names",
    name: "Unclear Variable Names",
    description:
      "Flag single-letter variables (outside loop indices), overly abbreviated names, and misleading identifiers that reduce code readability.",
    category: "quality",
    severity: "low",
    enabled: true,
  },
];
