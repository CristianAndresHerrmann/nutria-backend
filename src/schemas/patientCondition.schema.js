const { z } = require('zod');
const { ConditionType } = require('@prisma/client');
const { optionalField, pastOrTodayDate } = require('./common.schema');

// Las mismas tres reglas son CHECK en la migración (patient_condition_*_chk).
// Acá se validan antes de llegar a la base para responder 400 con el campo
// puntual, en vez de un 500 por violación de constraint.
function validateConditionTarget(data, ctx) {
  const isPathology = data.type === ConditionType.pathology;
  const hasFood = data.foodId !== null;
  const hasFoodGroup = data.foodGroupId !== null;

  if (isPathology && data.pathologyId === null) {
    ctx.addIssue({ code: 'custom', path: ['pathologyId'], message: 'Indicá la patología' });
  }
  if (!isPathology && data.pathologyId !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['pathologyId'],
      message: 'Solo una condición de tipo patología lleva una patología asociada',
    });
  }

  if (hasFood && hasFoodGroup) {
    ctx.addIssue({
      code: 'custom',
      path: ['foodGroupId'],
      message: 'Indicá un alimento o un grupo de alimentos, no ambos',
    });
  }
  if (isPathology && (hasFood || hasFoodGroup)) {
    ctx.addIssue({
      code: 'custom',
      path: [hasFood ? 'foodId' : 'foodGroupId'],
      message: 'Una condición de tipo patología no referencia alimentos',
    });
  }
  // Las condiciones que no son patología restringen algo del catálogo (RF-24):
  // sin alimento ni grupo no habría qué restringir.
  if (!isPathology && !hasFood && !hasFoodGroup) {
    ctx.addIssue({
      code: 'custom',
      path: ['foodId'],
      message: 'Indicá un alimento o un grupo de alimentos',
    });
  }
}

const patientConditionSchema = z
  .strictObject({
    type: z.enum(Object.values(ConditionType), 'El tipo de condición no es válido'),
    pathologyId: optionalField(z.guid('La patología no es válida')),
    foodId: optionalField(z.guid('El alimento no es válido')),
    foodGroupId: optionalField(z.guid('El grupo de alimentos no es válido')),
    // Si no viene, la base usa la fecha del día.
    registeredAt: optionalField(pastOrTodayDate('La fecha de registro')),
    observations: optionalField(z.string().max(1000)),
  })
  .superRefine(validateConditionTarget);

module.exports = { patientConditionSchema };
