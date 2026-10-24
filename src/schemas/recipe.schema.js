const { z } = require('zod');
const { CookingMethod, MealType } = require('@prisma/client');
const { optionalField, catalogName } = require('./common.schema');

const MAX_INGREDIENTS_PER_RECIPE = 50;
const MAX_TIME_MINUTES = 1440;

// Como en las consultas: el mensaje no nombra el campo porque viaja como clave
// en details.fields y el frontend lo muestra debajo del input.
function textField(maxLength) {
  return optionalField(
    z.string('Debe ser texto').max(maxLength, `No puede superar los ${maxLength} caracteres`),
  );
}

function hasNoRepeats(values) {
  return new Set(values).size === values.length;
}

// Uno o más tipos de comida, sin repetir. No hay CHECK que lo exprese (cruza
// tablas): la regla vive acá.
const mealTypesField = z
  .array(z.enum(Object.values(MealType), 'El tipo de comida no es válido'), 'Indicá al menos un tipo de comida')
  .min(1, 'Indicá al menos un tipo de comida')
  .refine(hasNoRepeats, 'Hay tipos de comida repetidos');

// Un ingrediente es siempre un alimento del catálogo, nunca texto libre: el
// Incremento 3 valida las recetas contra datos estructurados. El orden no se
// manda: es la posición en la lista.
const ingredientSchema = z.strictObject({
  foodId: z.guid('Elegí un alimento del catálogo'),
  quantityDescription: optionalField(
    z.string('Debe ser texto').max(200, 'La cantidad no puede superar los 200 caracteres'),
  ),
});

// Un alimento va una sola vez: si se incorpora en tandas, eso se indica en la
// preparación.
const ingredientsField = z
  .array(ingredientSchema, 'Los ingredientes deben ser una lista')
  .min(1, 'Agregá al menos un ingrediente')
  .max(MAX_INGREDIENTS_PER_RECIPE, `Una receta no puede tener más de ${MAX_INGREDIENTS_PER_RECIPE} ingredientes`)
  .refine(
    (ingredients) => hasNoRepeats(ingredients.map(({ foodId }) => foodId)),
    'Hay alimentos repetidos: si se incorporan en tandas, indicalo en la preparación',
  );

// Nombre, tipos de comida e ingredientes obligatorios; el resto es opcional. El
// dueño sale del token y el origen lo pone el servidor (professional en este
// incremento): mandarlos da 400 (strictObject).
const recipeFields = {
  name: catalogName('El nombre de la receta'),
  preparation: textField(5000),
  finalNote: textField(2000),
  cookingMethod: optionalField(z.enum(Object.values(CookingMethod), 'El método de cocción no es válido')),
  timeMinutes: optionalField(
    z
      .number('El tiempo debe ser un número')
      .int('El tiempo debe ser un número entero de minutos')
      .positive('El tiempo debe ser mayor a cero')
      .max(MAX_TIME_MINUTES, `El tiempo no puede superar los ${MAX_TIME_MINUTES} minutos`),
  ),
  purchasePlace: textField(200),
  mealTypes: mealTypesField,
  ingredients: ingredientsField,
};

// POST: la receta nace disponible en el catálogo.
const createRecipeSchema = z.strictObject(recipeFields);

// PUT: reemplazo completo, más la baja lógica. availableInCatalog omitido
// conserva el valor que tenía.
const updateRecipeSchema = z.strictObject({
  ...recipeFields,
  availableInCatalog: z.boolean('Debe ser verdadero o falso').optional(),
});

// Query del listado. Sin includeUnavailable, solo las disponibles. patientId
// aplica el filtro por condiciones del paciente (RF-28).
const listRecipesQuerySchema = z.strictObject({
  mealType: optionalField(z.enum(Object.values(MealType), 'El tipo de comida no es válido')),
  includeUnavailable: optionalField(z.enum(['true', 'false'], 'Debe ser true o false')).transform(
    (value) => value === 'true',
  ),
  patientId: optionalField(z.guid('El paciente no es válido')),
});

module.exports = { createRecipeSchema, updateRecipeSchema, listRecipesQuerySchema };
