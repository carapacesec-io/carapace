/**
 * File classifier.
 *
 * Detects language and blockchain ecosystem from file path and optional source
 * content. Used to select the appropriate review rules and prompt sections.
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getExtension(filePath: string): string {
  const lastDot = filePath.lastIndexOf(".");
  if (lastDot === -1 || lastDot === filePath.length - 1) return "";
  return filePath.slice(lastDot).toLowerCase();
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Language =
  | "solidity"
  | "rust"
  | "typescript"
  | "javascript"
  | "python"
  | "go"
  | "java"
  | "unknown";

export type Chain = "solidity";

export interface FileClassification {
  language: Language;
  chain?: Chain;
  isSmartContract: boolean;
}

// ---------------------------------------------------------------------------
// Extension -> language mapping
// ---------------------------------------------------------------------------

const EXT_MAP: Record<string, Language> = {
  ".sol": "solidity",
  ".rs": "rust",
  ".ts": "typescript",
  ".tsx": "typescript",
  ".js": "javascript",
  ".jsx": "javascript",
  ".py": "python",
  ".go": "go",
  ".java": "java",
};

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

export function classifyFile(
  filePath: string,
  content?: string,
): FileClassification {
  const ext = getExtension(filePath);
  const language: Language = EXT_MAP[ext] ?? "unknown";

  let chain: Chain | undefined;
  let isSmartContract = false;

  switch (language) {
    case "solidity": {
      chain = "solidity";
      isSmartContract = true;
      break;
    }

    case "rust": {
      break;
    }

    default:
      break;
  }

  return { language, chain, isSmartContract };
}
