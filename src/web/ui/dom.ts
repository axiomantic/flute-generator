// The studio's markup mixes <select>, <input>, <canvas> and plain elements behind one id
// lookup. StudioEl is the union of the properties the studio actually touches, so a typo in a
// property name is still a compile error while a single lookup helper stays usable for all of
// them.
export type StudioEl = HTMLElement & HTMLInputElement & HTMLSelectElement & HTMLCanvasElement;

/** Lookup that may legitimately miss. Callers must handle null. */
export function byId(id: string): StudioEl | null {
  return document.getElementById(id) as StudioEl | null;
}

/**
 * Lookup for the ids the studio dereferences unconditionally. A missing id was already fatal
 * before (a TypeError on the null); this reports the id instead of the property.
 */
export function requireEl(id: string): StudioEl {
  const el = document.getElementById(id);
  if (!el) throw new Error(`Studio markup is missing #${id}`);
  return el as StudioEl;
}

/** `getElementById(id) ? getElementById(id).value : fallback`, once. */
export function valueOr(id: string, fallback: string): string {
  const el = byId(id);
  return el ? el.value : fallback;
}

/** The value of the <select>/<input> an event fired on. */
export function eventValue(e: Event): string {
  const t = e.target;
  if (t instanceof HTMLInputElement || t instanceof HTMLSelectElement || t instanceof HTMLTextAreaElement) return t.value;
  throw new Error('event target carries no value');
}
