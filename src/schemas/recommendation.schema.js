const { z } = require('zod');
const { optionalField } = require('./common.schema');

const MAX_TITLE_LENGTH = 150;
const MAX_TEXT_LENGTH = 5000;

// Obligatorio y sin espacios en los extremos: "   " cuenta como vacío. El
// título se guarda además sin espacios de más (es una línea); el texto conserva
// sus saltos de línea.
function requiredText(label, maxLength, normalize = (value) => value.trim()) {
  return z
    .string(`${label} es obligatorio`)
    .transform(normalize)
    .pipe(
      z
        .string()
        .min(1, `${label} es obligatorio`)
        .max(maxLength, `No puede superar los ${maxLength} caracteres`),
    );
}

// El dueño sale del token: mandar nutritionistId da 400 (strictObject).
const recommendationFields = {
  pathologyId: z.guid('Elegí una patología'),
  title: requiredText('El título', MAX_TITLE_LENGTH, (value) => value.trim().replace(/\s+/g, ' ')),
  text: requiredText('El texto', MAX_TEXT_LENGTH),
};

// POST: la recomendación nace vigente.
const createRecommendationSchema = z.strictObject(recommendationFields);

// PUT: reemplazo completo, más la baja lógica. active omitido conserva el valor
// que tenía.
const updateRecommendationSchema = z.strictObject({
  ...recommendationFields,
  active: z.boolean('Debe ser verdadero o falso').optional(),
});

// Query del listado. Sin includeInactive, solo las vigentes.
const listRecommendationsQuerySchema = z.strictObject({
  pathologyId: optionalField(z.guid('La patología no es válida')),
  includeInactive: optionalField(z.enum(['true', 'false'], 'Debe ser true o false')).transform(
    (value) => value === 'true',
  ),
});

module.exports = { createRecommendationSchema, updateRecommendationSchema, listRecommendationsQuerySchema };
