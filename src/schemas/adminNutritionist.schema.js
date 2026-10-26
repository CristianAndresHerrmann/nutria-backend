const { z } = require('zod');
const { accountEmail, accountPassword } = require('./common.schema');

const MAX_NAME_LENGTH = 100;

// El rol no se elige: el panel solo da de alta nutricionistas. Mandar role o
// active da 400 (strictObject); la cuenta nace activa.
const createNutritionistSchema = z.strictObject({
  name: z
    .string('El nombre es obligatorio')
    .transform((value) => value.trim().replace(/\s+/g, ' '))
    .pipe(
      z
        .string()
        .min(1, 'El nombre es obligatorio')
        .max(MAX_NAME_LENGTH, `El nombre no puede superar los ${MAX_NAME_LENGTH} caracteres`),
    ),
  email: accountEmail(),
  password: accountPassword,
});

const setNutritionistActiveSchema = z.strictObject({
  active: z.boolean('Debe ser verdadero o falso'),
});

const resetNutritionistPasswordSchema = z.strictObject({
  password: accountPassword,
});

// z.guid() y no z.uuid(), igual que en los demás :id.
const nutritionistIdParamsSchema = z.strictObject({ id: z.guid() });

module.exports = {
  createNutritionistSchema,
  setNutritionistActiveSchema,
  resetNutritionistPasswordSchema,
  nutritionistIdParamsSchema,
};
