const { CookingMethod, MealType } = require('@prisma/client');
const { FOODS } = require('./catalogs');
const { COMMON_RECIPES } = require('./recipes');
const { missingCategories } = require('../../src/domain/reglas/mealComposition');

// Los criterios de docs/recetas-basicas.md (repo raíz) que la base no controla.
// Que cada ingrediente sea común lo valida además el servicio al cargarlas.
const foodsByName = new Map(FOODS.map((food) => [food.name, food]));

// Solo hierbas y especias entre los alimentos sin aporte a la composición: ni sal,
// ni azúcar, dulces, caldo en cubo o salsa de soja (DA-32). Tampoco fiambres. Con
// alguno, una regla de patología excluiría la receta completa.
const SEASONINGS_GROUP = 'Sal, especias y hierbas';
const isAvoided = ({ name, group, categories }) =>
  group === 'Fiambres y embutidos' ||
  (categories.includes('complementary') && (group !== SEASONINGS_GROUP || name.startsWith('Sal')));

describe('datos del seed — recetas básicas comunes (T30)', () => {
  it('no repite nombres de receta, sin distinguir mayúsculas', () => {
    const names = COMMON_RECIPES.map(({ name }) => name.toLocaleLowerCase('es'));
    expect(new Set(names).size).toBe(names.length);
  });

  it('usa solo alimentos del catálogo común, por su nombre exacto (DA-23)', () => {
    for (const { name, ingredients } of COMMON_RECIPES) {
      const missing = ingredients.filter(({ food }) => !foodsByName.has(food)).map(({ food }) => food);
      expect(missing, `"${name}" usa alimentos que no están en el catálogo`).toEqual([]);
    }
  });

  it('no repite un ingrediente dentro de una receta', () => {
    for (const { name, ingredients } of COMMON_RECIPES) {
      const foods = ingredients.map(({ food }) => food);
      expect(new Set(foods).size, `"${name}" repite un ingrediente`).toBe(foods.length);
    }
  });

  it('no lleva sal, azúcar, dulces, caldo, salsa de soja ni fiambres', () => {
    for (const { name, ingredients } of COMMON_RECIPES) {
      const avoided = ingredients.map(({ food }) => foodsByName.get(food)).filter(isAvoided).map((food) => food.name);
      expect(avoided, `"${name}" lleva alimentos evitados`).toEqual([]);
    }
  });

  it('tiene al menos 2 recetas por tipo de comida, y 2 sin cocción por tipo', () => {
    for (const mealType of Object.values(MealType)) {
      const forMeal = COMMON_RECIPES.filter(({ mealTypes }) => mealTypes.includes(mealType));
      expect(forMeal.length, mealType).toBeGreaterThanOrEqual(2);
      expect(forMeal.filter(({ cookingMethod }) => cookingMethod === CookingMethod.no_cooking).length, mealType).toBeGreaterThanOrEqual(2);
    }
  });

  it('usa valores válidos de cocción y tipo de comida, con tiempo y preparación', () => {
    for (const { name, cookingMethod, mealTypes, timeMinutes, preparation, ingredients } of COMMON_RECIPES) {
      expect(Object.values(CookingMethod), name).toContain(cookingMethod);
      expect(mealTypes.length, name).toBeGreaterThan(0);
      for (const mealType of mealTypes) expect(Object.values(MealType), name).toContain(mealType);
      expect(timeMinutes, name).toBeGreaterThan(0);
      expect(preparation, name).toBeTruthy();
      expect(ingredients.length, name).toBeGreaterThan(0);
    }
  });

  it('cubre la composición esperada de cada tipo de comida en que se ofrece (DA-29)', () => {
    for (const { name, ingredients, mealTypes } of COMMON_RECIPES) {
      const items = ingredients.map(({ food }) => ({ categories: foodsByName.get(food).categories }));
      for (const mealType of mealTypes) {
        expect(missingCategories(mealType, items), `"${name}" en ${mealType}`).toEqual([]);
      }
    }
  });
});
