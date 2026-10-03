import type { CourseData } from './types';
import campaignOrder from './campaign.json';

/**
 * Course registry.
 *
 * Every `src/levels/courses/*.json` file is a course. `campaign.json` lists
 * the campaign courses in unlock order; any other course (the gray test
 * course, editor drafts) is reachable from the debug menu and the editor.
 *
 * In dev mode the registry hot-reloads: when a course file changes (or the
 * editor creates one) Vite re-runs this module, which refreshes the shared
 * arrays in place and notifies listeners, so the game rebuilds the level
 * without a page refresh.
 */
type Listener = (course: CourseData) => void;

interface Registry {
  campaign: CourseData[];
  all: CourseData[];
  campaignIds: string[];
  listeners: Set<Listener>;
  json: Map<string, string>;
}

const modules = import.meta.glob<CourseData>('./courses/*.json', { eager: true, import: 'default' });

const hot = import.meta.hot;
const reg: Registry = hot?.data.registry ?? { campaign: [], all: [], campaignIds: [], listeners: new Set(), json: new Map() };
if (hot) hot.data.registry = reg;

function refresh(): void {
  const loaded = Object.values(modules).map((c) => structuredClone(c));
  const order = campaignOrder as string[];
  const byId = new Map(loaded.map((c) => [c.id, c]));
  const campaign = order.map((id) => byId.get(id)).filter((c): c is CourseData => !!c);
  const others = loaded.filter((c) => !order.includes(c.id)).sort((a, b) => (a.id === 'test' ? 1 : b.id === 'test' ? -1 : a.name.localeCompare(b.name)));
  const changed: CourseData[] = [];
  for (const c of loaded) {
    const text = JSON.stringify(c);
    if (reg.json.has(c.id) && reg.json.get(c.id) !== text) changed.push(c);
    reg.json.set(c.id, text);
  }
  // Mutate in place: modules that imported the arrays keep their references.
  reg.campaign.splice(0, reg.campaign.length, ...campaign);
  reg.all.splice(0, reg.all.length, ...campaign, ...others);
  reg.campaignIds.splice(0, reg.campaignIds.length, ...campaign.map((c) => c.id));
  for (const c of changed) for (const fn of reg.listeners) fn(c);
}

refresh();
// Must be spelled out literally: Vite detects self-accepting modules textually.
if (import.meta.hot) import.meta.hot.accept();

/** Campaign courses in unlock order. */
export const COURSES: CourseData[] = reg.campaign;

/** Every course: campaign first, then drafts and the test course. */
export function allCourses(): CourseData[] {
  return reg.all;
}

export function courseById(id: string): CourseData | undefined {
  return reg.all.find((c) => c.id === id);
}

export function isCampaign(id: string): boolean {
  return reg.campaignIds.includes(id);
}

/** Subscribe to hot-reloaded course data (dev only). */
export function onCourseHotUpdate(fn: Listener): () => void {
  reg.listeners.add(fn);
  return () => reg.listeners.delete(fn);
}
