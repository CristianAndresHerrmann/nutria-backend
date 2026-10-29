const { FoodCategoryType } = require('@prisma/client');
const { FOOD_GROUPS, FOODS } = require('./catalogs');

// La base no controla estas reglas: la unicidad entre comunes la resuelve el
// servicio y el seed actualiza por nombre, así que un repetido se fusiona sin aviso.
const normalize = (name) => name.trim().toLocaleLowerCase('es');

function duplicates(names) {
  const seen = new Set();
  return names.filter((name) => {
    const key = normalize(name);
    if (seen.has(key)) return true;
    seen.add(key);
    return false;
  });
}

const groupNames = FOOD_GROUPS.map(({ name }) => name);
const parentNames = new Set(FOOD_GROUPS.map(({ parent }) => parent).filter(Boolean));

describe('datos del seed — catálogo de alimentos', () => {
  it('tiene el volumen objetivo de alimentos comunes (DA-21)', () => {
    expect(FOODS.length).toBeGreaterThanOrEqual(150);
    expect(FOODS.length).toBeLessThanOrEqual(250);
  });

  it('no repite nombres de alimento, sin distinguir mayúsculas', () => {
    expect(duplicates(FOODS.map(({ name }) => name))).toEqual([]);
  });

  it('no repite nombres de grupo, sin distinguir mayúsculas', () => {
    expect(duplicates(groupNames)).toEqual([]);
  });

  it('no deja espacios de más en los nombres', () => {
    const names = [...groupNames, ...FOODS.map(({ name }) => name)];
    expect(names.filter((name) => name !== name.trim() || /\s{2,}/.test(name))).toEqual([]);
  });

  it('declara cada padre de grupo antes que sus hijos, con dos niveles como máximo (DA-21)', () => {
    const declared = new Map();
    for (const { name, parent } of FOOD_GROUPS) {
      if (parent) {
        expect(declared.has(parent), `el padre "${parent}" de "${name}" no está declarado antes`).toBe(true);
        expect(declared.get(parent), `"${parent}" es hijo: "${name}" sería de tercer nivel`).toBeNull();
      }
      declared.set(name, parent ?? null);
    }
  });

  it('asigna cada alimento a un grupo que existe', () => {
    const missing = FOODS.filter(({ group }) => !groupNames.includes(group)).map(({ name }) => name);
    expect(missing).toEqual([]);
  });

  it('asigna cada alimento a un grupo hoja', () => {
    const inParents = FOODS.filter(({ group }) => parentNames.has(group)).map(({ name }) => name);
    expect(inParents).toEqual([]);
  });

  it('no deja grupos hoja sin alimentos', () => {
    const used = new Set(FOODS.map(({ group }) => group));
    const empty = groupNames.filter((name) => !parentNames.has(name) && !used.has(name));
    expect(empty).toEqual([]);
  });

  it('da a cada alimento al menos una categoría, válida y sin repetir (RF-25)', () => {
    const valid = Object.values(FoodCategoryType);
    for (const { name, categories } of FOODS) {
      expect(categories.length, `"${name}" no tiene categorías`).toBeGreaterThan(0);
      expect(new Set(categories).size, `"${name}" repite una categoría`).toBe(categories.length);
      for (const category of categories) {
        expect(valid, `"${name}" tiene la categoría inválida "${category}"`).toContain(category);
      }
    }
  });

  it('usa complementary sola: no se combina con las categorías de composición (DA-32)', () => {
    const mixed = FOODS.filter(
      ({ categories }) => categories.includes('complementary') && categories.length > 1,
    ).map(({ name }) => name);
    expect(mixed).toEqual([]);
  });

  it('conserva los nombres que el seed referencia por nombre (condiciones y recetas)', () => {
    const foodNames = FOODS.map(({ name }) => name);
    const referenced = [
      'Leche', 'Nueces', 'Zapallo', 'Banana', 'Arroz blanco', 'Atún al natural', 'Tomate', 'Lechuga',
      'Aceite de oliva', 'Avena arrollada', 'Yogur natural', 'Manzana', 'Semillas de chía',
    ];
    expect(referenced.filter((name) => !foodNames.includes(name))).toEqual([]);
    expect(['Frutas', 'Pescados', 'Leches y yogures'].filter((name) => !groupNames.includes(name))).toEqual([]);
  });
});
