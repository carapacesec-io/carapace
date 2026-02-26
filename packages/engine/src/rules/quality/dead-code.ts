import type { Rule } from "../registry.js";

export const deadCodeRules: Rule[] = [
  {
    id: "qual-unused-imports",
    name: "Unused Imports",
    description:
      "Detect imported modules, functions, or types that are never referenced in the file. Unused imports increase bundle size and reduce clarity.",
    category: "quality",
    severity: "low",
    enabled: true,
  },
  {
    id: "qual-unreachable-code",
    name: "Unreachable Code",
    description:
      "Detect code after return/throw/break/continue statements that will never execute. Indicates logic errors or leftover debugging code.",
    category: "quality",
    severity: "medium",
    enabled: true,
  },
  {
    id: "qual-empty-catch",
    name: "Empty Catch Blocks",
    description:
      "Flag empty catch blocks that silently swallow errors. At minimum, log the error. Silent failures make debugging extremely difficult.",
    category: "quality",
    severity: "medium",
    enabled: true,
  },
];
