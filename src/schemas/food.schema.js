const { z } = require('zod');
const { FoodCategoryType } = require('@prisma/client');
const { optionalField, catalogName } = require('./common.schema');

// Una o más categorías nutricionales (RF-25), sin repetir. El enum sale del
// cliente de Prisma para que no se desincronice del de la base.
const categoriesField = z
  .array(z.enum(Object.values(FoodCategoryType), 'La categoría no es válida'), 'Indicá al menos una categoría')
  .min(1, 'Indicá al menos una categoría')
  .refine((categories) => new Set(categories).size === categories.length, 'Hay categorías repetidas');

const baseFoodFields = {
  name: catalogName('El nombre del alimento'),
  foodGroupId: z.guid('Indicá el grupo de alimentos'),
  categories: categoriesField,
};

// El alimento nace vigente. createdById no se acepta: el autor sale del token.
const createFoodSchema = z.strictObject(baseFoodFields);

// PUT es reemplazo completo: `active` es obligatorio para que omitirlo no
// reactive ni dé de baja un alimento sin querer. Dar de baja = active false
// (baja lógica): no hay borrado físico.
const updateFoodSchema = z.strictObject({
  ...baseFoodFields,
  active: z.boolean('Indicá si el alimento está vigente'),
});

// Query del listado. Sin includeInactive, solo los vigentes: es lo que tiene que
// ofrecer cualquier selector de alimentos.
const listFoodsQuerySchema = z.strictObject({
  search: optionalField(z.string().max(100)),
  groupId: optionalField(z.guid('El grupo de alimentos no es válido')),
  includeInactive: z
    .enum(['true', 'false'], 'includeInactive debe ser true o false')
    .optional()
    .transform((value) => value === 'true'),
});

module.exports = { createFoodSchema, updateFoodSchema, listFoodsQuerySchema };
