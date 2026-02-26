#!/usr/bin/env node
/**
 * setup-private.mjs
 *
 * Copies *.private.example.ts → *.private.ts for any missing private files.
 * This allows open-source builds to compile with stub implementations.
 *
 * Run automatically via `pnpm install` (prepare hook) or manually:
 *   node scripts/setup-private.mjs
 */

import { readdirSync, existsSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function walk(dir) {
  const results = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules" && entry.name !== "dist" && entry.name !== ".next") {
        results.push(...walk(full));
      } else if (entry.isFile() && entry.name.endsWith(".private.example.ts")) {
        results.push(full);
      }
    }
  } catch { /* skip inaccessible dirs */ }
  return results;
}

const examples = walk(ROOT);
let copied = 0;

for (const example of examples) {
  const target = example.replace(".private.example.ts", ".private.ts");
  if (!existsSync(target)) {
    copyFileSync(example, target);
    const rel = target.replace(ROOT + "/", "");
    console.log(`  Created ${rel} from example stub`);
    copied++;
  }
}

if (copied > 0) {
  console.log(`\n  ${copied} private stub(s) created. For full functionality, obtain a license at https://carapacesec.io\n`);
} else {
  // All private files exist — either real or previously copied stubs
}
