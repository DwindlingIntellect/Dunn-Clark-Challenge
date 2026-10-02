import type { MovementConfig } from '../config/movement';

/**
 * Produce a ready-to-paste src/config/movement.ts from the original source
 * text, replacing each value with the live one and keeping every comment.
 */
export function movementToCode(source: string, cfg: MovementConfig): string {
  const groups = cfg as unknown as Record<string, Record<string, unknown>>;
  let group: string | null = null;
  let inObject = false;
  const out: string[] = [];
  for (const line of source.split('\n')) {
    if (/^export const movement = \{/.test(line)) inObject = true;
    if (inObject) {
      const g = line.match(/^ {2}(\w+): \{\s*$/);
      if (g) group = g[1];
      else if (/^ {2}\},?\s*$/.test(line)) group = null;
      else if (/^\};/.test(line)) inObject = false;
      const kv = line.match(/^( {4})(\w+): (.+),\s*$/);
      if (kv && group && groups[group] && kv[2] in groups[group]) {
        out.push(`${kv[1]}${kv[2]}: ${formatValue(groups[group][kv[2]])},`);
        continue;
      }
    }
    out.push(line);
  }
  return out.join('\n');
}

/** Plain object literal (no comments) – used when the source text is unavailable. */
export function movementToLiteral(cfg: MovementConfig): string {
  const groups = cfg as unknown as Record<string, Record<string, unknown>>;
  const lines = ['export const movement = {'];
  for (const g of Object.keys(groups)) {
    lines.push(`  ${g}: {`);
    for (const k of Object.keys(groups[g])) lines.push(`    ${k}: ${formatValue(groups[g][k])},`);
    lines.push('  },');
  }
  lines.push('};');
  return lines.join('\n');
}

function formatValue(v: unknown): string {
  if (typeof v === 'number') return String(Math.round(v * 10000) / 10000);
  return JSON.stringify(v);
}
