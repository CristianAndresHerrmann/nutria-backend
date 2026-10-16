const { z } = require('zod');
const { FoodCategoryType } = require('@prisma/client');
const { optionalField, catalogName } = require('./common.schema');

// Una o más categorías nutricionales (RF-25), sin repetir. El enum sale del
// cliente de Prisma para que no se desincronice del de la base.
const categoriesField = z
  .array(z.enum(Object.values(FoodCategoryType), 'La categoría no es válida'), 'Indicá al menos una categoría')
  .min(1, 'Indicá al menos una categoría')
  .refine((categories) => new Set(categories).size === categories.length, 'Hay categorías repetidas');

// Alta de un alimento privado. Nace vigente, y el dueño sale del token: un
// nutritionistId en el body da 400 (strictObject).
const createFoodSchema = z.strictObject({
  name: catalogName('El nombre del alimento'),
  foodGroupId: z.guid('Indicá el grupo de alimentos'),
  categories: categoriesField,
});

// Query del listado. Siempre devuelve solo los vigentes.
const listFoodsQuerySchema = z.strictObject({
  search: optionalField(z.string().max(100)),
  groupId: optionalField(z.guid('El grupo de alimentos no es válido')),
});

module.exports = { createFoodSchema, listFoodsQuerySchema };
