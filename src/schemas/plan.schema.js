const { z } = require('zod');
const { MealType, OptionItemType } = require('@prisma/client');
const { optionalField } = require('./common.schema');

// Ítem de una opción del plan. La misma regla es CHECK en la migración
// (option_item_type_chk): cada tipo referencia exactamente lo suyo. Acá se valida
// antes de llegar a la base para responder 400 con el campo puntual, en vez de un
// 500 por violación de constraint. El cliente solo manda la referencia: la copia
// del nombre y las categorías (DA-16) la arma el backend desde el catálogo, así
// que foodName, foodCategories o foodGroupName en el body dan 400 (strictObject).
// Lo usa la edición del borrador (updatePlanSchema).
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

const MEAL_TYPES = Object.values(MealType);
const mealTypeField = z.enum(MEAL_TYPES, { error: 'El tipo de comida no es válido' });

// Mismos topes que la propuesta de la IA (contrato de T33): un borrador generado
// siempre se puede volver a guardar tal cual.
const PLAN_TEXT_MAX_LENGTH = 4000;
const SHORT_TEXT_MAX_LENGTH = 500;
const MAX_OPTIONS_PER_MEAL = 10;
const MAX_ITEMS_PER_OPTION = 15;

function planText(maxLength) {
  return optionalField(z.string().max(maxLength, `No puede superar los ${maxLength} caracteres`));
}

function hasNoRepeats(values) {
  return new Set(values).size === values.length;
}

// POST /patients/:id/plans/generate. Sin body, se piden las cuatro comidas.
const generatePlanSchema = z.strictObject({
  mealTypes: z
    .array(mealTypeField)
    .min(1, 'Indicá al menos un tipo de comida')
    .refine(hasNoRepeats, 'Hay tipos de comida repetidos')
    .default(() => [...MEAL_TYPES]),
});

// Opciones e ítems vacíos se aceptan: es un borrador, y el guardado parcial no
// completa ni descarta nada (la composición incompleta queda como advertencia).
const optionSchema = z.strictObject({
  description: planText(SHORT_TEXT_MAX_LENGTH),
  items: z
    .array(optionItemSchema)
    .max(MAX_ITEMS_PER_OPTION, `Una opción no puede tener más de ${MAX_ITEMS_PER_OPTION} ítems`),
});

const mealSchema = z.strictObject({
  mealType: mealTypeField,
  instructions: planText(SHORT_TEXT_MAX_LENGTH),
  options: z
    .array(optionSchema)
    .max(MAX_OPTIONS_PER_MEAL, `Una comida no puede tener más de ${MAX_OPTIONS_PER_MEAL} opciones`),
});

// PUT /patients/:id/plans/:planId: reemplazo completo del borrador. Un texto
// omitido se guarda como null. Las recomendaciones clínicas son texto: las que
// se toman del catálogo se copian (DA-16, DA-27).
const updatePlanSchema = z.strictObject({
  situationalDiagnosis: planText(PLAN_TEXT_MAX_LENGTH),
  introduction: planText(PLAN_TEXT_MAX_LENGTH),
  objectives: planText(PLAN_TEXT_MAX_LENGTH),
  generalRecommendations: planText(PLAN_TEXT_MAX_LENGTH),
  contextualRecommendations: planText(PLAN_TEXT_MAX_LENGTH),
  clinicalRecommendations: planText(PLAN_TEXT_MAX_LENGTH),
  thematicRecommendations: planText(PLAN_TEXT_MAX_LENGTH),
  meals: z
    .array(mealSchema)
    .max(MEAL_TYPES.length, `El plan no puede tener más de ${MEAL_TYPES.length} comidas`)
    .refine((meals) => hasNoRepeats(meals.map(({ mealType }) => mealType)), 'Hay tipos de comida repetidos'),
});

// /patients/:id/plans/:planId. z.guid() por lo mismo que patientIdParamsSchema.
const planParamsSchema = z.strictObject({ id: z.guid(), planId: z.guid() });

module.exports = { optionItemSchema, generatePlanSchema, updatePlanSchema, planParamsSchema };
