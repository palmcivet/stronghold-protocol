/** @type {typeof import('../types/references.js').danglingReferences} */
export function danglingReferences(references, cases) {
  const known = cases instanceof Set ? cases : new Set(cases);
  /** @type {import('../types/references.js').DanglingReference[]} */
  const dangling = [];
  for (const [id, reference] of references) {
    if (!known.has(reference)) {
      dangling.push({ id, reference });
    }
  }
  return dangling;
}
