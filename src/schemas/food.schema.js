const { z } = require('zod');
const { FoodCategoryType } = require('@prisma/client');
const { optionalField, catalogName } = require('./common.schema');

// Una o más categorías nutricionales (RF-25), sin repetir. El enum sale del
// cliente de Prisma para que no se desincronice del de la base.
const categoriesField = z
  .array(z.enum(Object.values(FoodCategoryType), 'La categoría no es válida'), 'Indicá al menos una categoría')
  .min(1, 'Indicá al menos una categoría')
  .refine((categories) => new Set(categories).size === categories.length, 'Hay categorías repetidas');

const foodFields = {
  name: catalogName('El nombre del alimento'),
  foodGroupId: z.guid('Indicá el grupo de alimentos'),
  categories: categoriesField,
};

// Alta de un alimento: privado desde la cuenta de un nutricionista, común desde
// el panel del administrador (T25). Nace vigente, y el dueño nunca viaja en el
// body: un nutritionistId da 400 (strictObject).
const createFoodSchema = z.strictObject(foodFields);

// PUT del administrador: reemplazo completo, más la baja lógica y la
// reactivación. active omitido conserva el valor que tenía. El dueño no se
// cambia acá: un privado pasa al común solo con promoteFoodSchema.
const updateFoodSchema = z.strictObject({
  ...foodFields,
  active: z.boolean('Debe ser verdadero o falso').optional(),
});

// Pasar un privado al catálogo común. Sin name conserva el que tenía; con name
// lo renombra en la misma operación, para resolver un choque con un común.
const promoteFoodSchema = z.strictObject({
  name: optionalField(catalogName('El nombre del alimento')),
});

// Query del listado del nutricionista. Siempre devuelve solo los vigentes.
const listFoodsQuerySchema = z.strictObject({
  search: optionalField(z.string().max(100)),
  groupId: optionalField(z.guid('El grupo de alimentos no es válido')),
});

// Query del listado del administrador: incluye las bajas y los privados de
// todos. owner filtra por "common" (los comunes) o por el id de un
// nutricionista (sus privados).
const OWNER_MESSAGE = 'Indicá "common" o el id de un nutricionista';
const adminListFoodsQuerySchema = z.strictObject({
  ...listFoodsQuerySchema.shape,
  owner: optionalField(z.union([z.literal('common'), z.guid(OWNER_MESSAGE)], OWNER_MESSAGE)),
});

// Query de la actividad del catálogo (T25): opcionalmente, los alimentos que
// cargó un solo nutricionista.
const catalogActivityQuerySchema = z.strictObject({
  nutritionistId: optionalField(z.guid('El nutricionista no es válido')),
});

module.exports = {
  createFoodSchema,
  updateFoodSchema,
  promoteFoodSchema,
  listFoodsQuerySchema,
  adminListFoodsQuerySchema,
  catalogActivityQuerySchema,
};
