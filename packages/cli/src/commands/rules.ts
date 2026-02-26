import { getAllRules } from "@carapace/engine";
import { formatRulesTable } from "../formatter.js";

export function runRules(ruleset?: string): void {
  let rules = getAllRules();

  if (ruleset) {
    const filter = new Set(ruleset.split(",").map((s) => s.trim()));
    rules = rules.filter((r) => {
      if (filter.has(r.category)) return true;
      if (r.chain && filter.has(r.chain)) return true;
      return false;
    });
  }

  const rows = rules.map((r) => ({
    id: r.id,
    name: r.name,
    severity: r.severity,
    enabled: r.enabled,
  }));

  process.stdout.write(formatRulesTable(rows));
}
