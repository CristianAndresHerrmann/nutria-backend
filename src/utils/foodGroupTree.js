// Operaciones sobre la jerarquía de grupos de alimentos (RF-24). Reciben la
// lista plana { id, parentId } completa: el catálogo de grupos es chico (decenas
// de filas), así que recorrerlo en memoria es más simple que una consulta
// recursiva y deja la regla testeable sin base.

function parentById(groups) {
  return new Map(groups.map((group) => [group.id, group.parentId ?? null]));
}

// true si poner a `groupId` dentro de `newParentId` cierra un ciclo: el padre
// nuevo es el mismo grupo o uno de sus descendientes. Se sube desde el padre
// nuevo hacia la raíz buscando `groupId`. El límite de pasos corta un ciclo que
// ya existiera en los datos, para no quedar en un loop infinito.
function wouldCreateCycle(groups, groupId, newParentId) {
  if (newParentId === null || newParentId === undefined) return false;

  const parents = parentById(groups);
  let current = newParentId;

  for (let steps = 0; current !== null && current !== undefined && steps <= groups.length; steps += 1) {
    if (current === groupId) return true;
    current = parents.get(current) ?? null;
  }

  return false;
}

// El grupo y todos sus descendientes, a cualquier profundidad. Filtrar alimentos
// por "Carnes, pescados y huevos" incluye los de Aves, Pescados, etc.
function descendantIds(groups, rootId) {
  const childrenOf = new Map();
  for (const group of groups) {
    const parentId = group.parentId ?? null;
    if (!childrenOf.has(parentId)) childrenOf.set(parentId, []);
    childrenOf.get(parentId).push(group.id);
  }

  const result = [];
  const seen = new Set();
  const pending = [rootId];

  while (pending.length > 0) {
    const id = pending.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    result.push(id);
    pending.push(...(childrenOf.get(id) || []));
  }

  return result;
}

module.exports = { wouldCreateCycle, descendantIds };
