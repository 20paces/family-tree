export const RELATION_KINDS = [
  'parent_biological',
  'parent_adoptive',
  'parent_step',
  'partner',
  'partner_former'
];

const PARENT_KINDS = new Set(['parent_biological', 'parent_adoptive', 'parent_step']);

export function isRelationKind(kind) {
  return RELATION_KINDS.includes(kind);
}

// Biological half-siblings share exactly one biological parent and are not the same person.
export function halfSiblings(personId, relationships) {
  const live = relationships.filter(row => row.kind === 'parent_biological' && !row.deleted_at && row.published !== 0);
  const parentsOf = (id) => live.filter(row => row.to_id === id).map(row => row.from_id);
  const mine = new Set(parentsOf(personId));
  const others = new Set(live.map(row => row.to_id).filter(id => id !== personId));
  const found = [];
  for (const other of others) {
    const shared = parentsOf(other).filter(parentId => mine.has(parentId));
    if (shared.length === 1) found.push({ personId: other, sharedParentId: shared[0] });
  }
  return found;
}

export function parentsOf(personId, relationships, kinds = PARENT_KINDS) {
  return relationships.filter(row => kinds.has(row.kind) && row.to_id === personId && !row.deleted_at);
}

export { PARENT_KINDS };
