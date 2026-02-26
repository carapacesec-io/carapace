/**
 * AST Scanner — re-exports from private implementation.
 *
 * The TypeScript Compiler API-based checks (unused imports, variables,
 * cyclomatic complexity, etc.) are proprietary.
 * See ast-scanner.private.ts for the implementation.
 */

export { scanFileAST } from "./ast-scanner.private.js";
