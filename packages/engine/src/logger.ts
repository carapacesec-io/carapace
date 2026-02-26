/**
 * Minimal structured logger for @carapace/engine.
 *
 * Respects CARAPACE_LOG_LEVEL env var (debug | info | warn | error | silent).
 * Writes to stderr so stdout stays clean for CLI/CI output.
 */

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 } as const;
type Level = keyof typeof LEVELS;

function parseLevel(raw: string | undefined): number {
  if (!raw) return LEVELS.info;
  const key = raw.toLowerCase() as Level;
  return LEVELS[key] ?? LEVELS.info;
}

const level = parseLevel(process.env.CARAPACE_LOG_LEVEL);

export const logger = {
  debug(msg: string) { if (level <= LEVELS.debug) process.stderr.write(`[carapace] ${msg}\n`); },
  info(msg: string)  { if (level <= LEVELS.info)  process.stderr.write(`[carapace] ${msg}\n`); },
  warn(msg: string)  { if (level <= LEVELS.warn)  process.stderr.write(`[carapace] ${msg}\n`); },
  error(msg: string) { if (level <= LEVELS.error) process.stderr.write(`[carapace] ${msg}\n`); },
};
