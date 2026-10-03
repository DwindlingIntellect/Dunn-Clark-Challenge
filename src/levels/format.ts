import type { CourseData } from './types';

/**
 * Deterministic JSON layout for course files: fixed key order, numbers
 * rounded to 4 decimals and one piece / link / checkpoint per line, so
 * files diff cleanly whether written by hand or by the editor.
 */
const COURSE_KEYS: (keyof CourseData)[] = [
  'id', 'name', 'flavor', 'atmosphere', 'start', 'finish', 'checkpoints', 'killY', 'medals',
  'droneHz', 'backdrop', 'pieces', 'jumpLinks', 'lights',
];
const PIECE_KEYS = ['id', 'type', 'pos', 'size', 'rot', 'tags', 'mat', 'repeat', 'group'];
const LINK_KEYS = ['from', 'to', 'move', 'via', 'route'];

function num(n: number): number {
  return Math.round(n * 10000) / 10000;
}

/** Compact single-line JSON with ", " separators and rounded numbers. */
function inline(v: unknown, keys?: string[]): string {
  if (typeof v === 'number') return String(num(v));
  if (Array.isArray(v)) return `[${v.map((x) => inline(x)).join(', ')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    const order = keys ? [...keys, ...Object.keys(o).filter((k) => !keys.includes(k))] : Object.keys(o);
    const parts = order.filter((k) => o[k] !== undefined).map((k) => `${JSON.stringify(k)}: ${inline(o[k])}`);
    return `{ ${parts.join(', ')} }`;
  }
  return JSON.stringify(v);
}

function list(items: unknown[] | undefined, keys?: string[]): string {
  if (!items || items.length === 0) return '[]';
  return `[\n${items.map((i) => `    ${inline(i, keys)}`).join(',\n')}\n  ]`;
}

export function formatCourse(c: CourseData): string {
  const o = c as unknown as Record<string, unknown>;
  const order = [...COURSE_KEYS, ...Object.keys(o).filter((k) => !COURSE_KEYS.includes(k as keyof CourseData))];
  const lines: string[] = [];
  for (const k of order) {
    const v = o[k];
    if (v === undefined) continue;
    let text: string;
    if (k === 'pieces') text = list(v as unknown[], PIECE_KEYS);
    else if (k === 'jumpLinks') text = list(v as unknown[], LINK_KEYS);
    else if (k === 'checkpoints' || k === 'lights') text = list(v as unknown[]);
    else text = inline(v);
    lines.push(`  ${JSON.stringify(k)}: ${text}`);
  }
  return `{\n${lines.join(',\n')}\n}\n`;
}
