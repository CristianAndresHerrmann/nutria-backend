const { z } = require('zod');
const { OptionItemType } = require('@prisma/client');
// Solo por la configuración global de Zod (mensajes en castellano).
require('./common.schema');

// Ítem de una opción del plan. La misma regla es CHECK en la migración
// (option_item_type_chk): cada tipo referencia exactamente lo suyo. Acá se valida
// antes de llegar a la base para responder 400 con el campo puntual, en vez de un
// 500 por violación de constraint. El cliente solo manda la referencia: la copia
// del nombre y las categorías (DA-16) la arma el backend desde el catálogo, así
// que foodName, foodCategories o foodGroupName en el body dan 400 (strictObject).
// Todavía no está montado en ninguna ruta: lo usan la generación (T34) y la
// edición del plan.
const MAX_ORIGINAL_TEXT_LENGTH = 300;

const optionItemSchema = z.discriminatedUnion(
  'type',
  [
    z.strictObject({
      type: z.literal(OptionItemType.food),
      foodId: z.guid('El alimento no es válido'),
    }),
    z.strictObject({
      type: z.literal(OptionItemType.food_group),
      foodGroupId: z.guid('El grupo de alimentos no es válido'),
    }),
    z.strictObject({
      type: z.literal(OptionItemType.recipe),
      recipeId: z.guid('La receta no es válida'),
    }),
    // El texto de la propuesta que no se resolvió contra el catálogo (DA-26).
    z.strictObject({
      type: z.literal(OptionItemType.unrecognized),
      originalText: z
        .string('Indicá el texto del ítem')
        .trim()
        .min(1, 'Indicá el texto del ítem')
        .max(MAX_ORIGINAL_TEXT_LENGTH, `El texto del ítem no puede superar los ${MAX_ORIGINAL_TEXT_LENGTH} caracteres`),
    }),
  ],
  { error: 'El tipo de ítem no es válido' },
);

module.exports = { optionItemSchema };
