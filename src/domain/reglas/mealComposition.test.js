const { FoodCategoryType, MealType } = require('@prisma/client');
const { MEAL_COMPOSITION, missingCategories } = require('./mealComposition');

describe('missingCategories', () => {
  it('una opción completa no tiene faltantes (un alimento puede cubrir dos categorías)', () => {
    const items = [{ categories: ['vegetable'] }, { categories: ['protein', 'carbohydrate'] }];
    expect(missingCategories('lunch', items)).toEqual([]);
  });

  it('informa la categoría que le falta a la opción', () => {
    const items = [{ categories: ['protein'] }, { categories: ['carbohydrate'] }];
    expect(missingCategories('dinner', items)).toEqual(['vegetable']);
  });

  it('un tipo de comida sin composición definida no tiene faltantes', () => {
    const composition = { breakfast: null };
    expect(missingCategories('breakfast', [], composition)).toEqual([]);
  });

  it('una opción vacía informa todas las categorías, en el orden de la configuración', () => {
    expect(missingCategories('lunch', [])).toEqual(['vegetable', 'protein', 'carbohydrate']);
  });

  it('las categorías que no se esperan no cambian el resultado', () => {
    const items = [{ categories: ['infusion'] }, { categories: ['healthy_fat', 'protein'] }];
    expect(missingCategories('lunch', items)).toEqual(['vegetable', 'carbohydrate']);
  });

  it.each(['breakfast', 'afternoon_snack'])('%s: lácteo y pan o cereal completan la opción', (mealType) => {
    const items = [{ categories: ['infusion'] }, { categories: ['protein'] }, { categories: ['carbohydrate', 'fiber'] }];
    expect(missingCategories(mealType, items)).toEqual([]);
  });

  it.each(['breakfast', 'afternoon_snack'])('%s: sin lácteo ni pan o cereal, informa ambos', (mealType) => {
    const items = [{ categories: ['infusion'] }, { categories: ['fiber'] }];
    expect(missingCategories(mealType, items)).toEqual(['protein', 'carbohydrate']);
  });
});

describe('MEAL_COMPOSITION', () => {
  it('tiene una entrada por cada tipo de comida', () => {
    expect(Object.keys(MEAL_COMPOSITION).sort()).toEqual(Object.values(MealType).sort());
  });

  it.each(Object.entries(MEAL_COMPOSITION))('%s usa categorías existentes', (_mealType, categories) => {
    for (const category of categories ?? []) {
      expect(Object.values(FoodCategoryType)).toContain(category);
    }
  });
});
