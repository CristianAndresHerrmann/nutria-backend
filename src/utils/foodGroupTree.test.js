const { wouldCreateCycle, descendantIds, groupFilterIds } = require('./foodGroupTree');

// Carnes, pescados y huevos
// ├── Aves
// │   └── Aves de corral
// └── Pescados
// Lácteos
const GROUPS = [
  { id: 'carnes', parentId: null },
  { id: 'aves', parentId: 'carnes' },
  { id: 'corral', parentId: 'aves' },
  { id: 'pescados', parentId: 'carnes' },
  { id: 'lacteos', parentId: null },
];

describe('foodGroupTree.wouldCreateCycle — jerarquía sin ciclos', () => {
  it('detecta un grupo que se pone como su propio padre', () => {
    expect(wouldCreateCycle(GROUPS, 'aves', 'aves')).toBe(true);
  });

  it('detecta un grupo que se pone dentro de su hijo', () => {
    expect(wouldCreateCycle(GROUPS, 'carnes', 'aves')).toBe(true);
  });

  it('detecta un grupo que se pone dentro de su nieto', () => {
    expect(wouldCreateCycle(GROUPS, 'carnes', 'corral')).toBe(true);
  });

  it('permite mover un grupo a otra rama', () => {
    expect(wouldCreateCycle(GROUPS, 'aves', 'lacteos')).toBe(false);
  });

  it('permite mover un subgrupo dentro de un hermano', () => {
    expect(wouldCreateCycle(GROUPS, 'pescados', 'aves')).toBe(false);
  });

  it('permite dejar un grupo en la raíz', () => {
    expect(wouldCreateCycle(GROUPS, 'corral', null)).toBe(false);
  });

  it('no queda en un loop si los datos ya traen un ciclo', () => {
    const broken = [
      { id: 'a', parentId: 'b' },
      { id: 'b', parentId: 'a' },
    ];

    expect(wouldCreateCycle(broken, 'c', 'a')).toBe(false);
  });
});

describe('foodGroupTree.descendantIds', () => {
  it('incluye el grupo y todos sus descendientes', () => {
    expect(descendantIds(GROUPS, 'carnes').sort()).toEqual(['aves', 'carnes', 'corral', 'pescados']);
  });

  it('un grupo sin hijos devuelve solo su id', () => {
    expect(descendantIds(GROUPS, 'lacteos')).toEqual(['lacteos']);
  });
});

describe('foodGroupTree.groupFilterIds', () => {
  it('un filtro existente conserva el orden del grupo y sus descendientes', () => {
    expect(groupFilterIds(GROUPS, 'carnes')).toEqual(['carnes', 'pescados', 'aves', 'corral']);
    expect(groupFilterIds(GROUPS, 'lacteos')).toEqual(['lacteos']);
  });

  it('un filtro inexistente no incluye hijos huérfanos ni coincide con alimentos', () => {
    expect(groupFilterIds([{ id: 'hijo', parentId: 'ausente' }], 'ausente')).toEqual([]);
    expect(groupFilterIds([], 'ausente')).toEqual([]);
  });
});
