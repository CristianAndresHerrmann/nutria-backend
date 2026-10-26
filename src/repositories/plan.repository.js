const prisma = require('../lib/prisma');

// El plan completo, en el orden en que se muestra: las comidas en el orden del
// enum (desayuno a cena), y las opciones y sus ítems por posición. Los hallazgos
// viajan con el plan porque el editor los marca sobre sus ítems y opciones.
const PLAN_INCLUDE = {
  meals: {
    orderBy: { mealType: 'asc' },
    include: {
      options: {
        orderBy: { order: 'asc' },
        include: { items: { orderBy: { order: 'asc' } } },
      },
    },
  },
  findings: { orderBy: [{ detectedAt: 'asc' }, { id: 'asc' }] },
};

// Como en patient.repository: Prisma ignora un filtro undefined, y un where
// { id, nutritionistId: undefined } buscaría planes de cualquier nutricionista.
// Se corta acá con un 500 en vez de devolver datos de otro.
function assertNutritionistId(nutritionistId) {
  if (typeof nutritionistId !== 'string' || nutritionistId.length === 0) {
    throw new Error('plan.repository: consulta sin nutritionistId');
  }
}

// Las comidas, opciones, ítems, hallazgos y generaciones se escriben con la
// generación (T34) y la validación (T37), que definen sus transacciones.
function createPlanRepository({ prisma: client }) {
  function findAllForPatient(patientId, nutritionistId) {
    assertNutritionistId(nutritionistId);
    return client.plan.findMany({ where: { patientId, nutritionistId }, orderBy: { updatedAt: 'desc' } });
  }

  function findByIdForNutritionist(id, nutritionistId, db = client) {
    assertNutritionistId(nutritionistId);
    return db.plan.findFirst({ where: { id, nutritionistId }, include: PLAN_INCLUDE });
  }

  // El estado (draft) lo pone la base. Si el paciente no es de este
  // nutricionista, la FK compuesta (patient_id, nutritionist_id) rechaza el alta.
  function create(nutritionistId, data) {
    assertNutritionistId(nutritionistId);
    return client.plan.create({ data: { ...data, nutritionistId } });
  }

  // updateMany filtra por nutritionistId en el mismo where: un id de otro
  // nutricionista actualiza 0 filas en vez de escribir sobre un plan ajeno.
  async function updateForNutritionist(id, nutritionistId, data) {
    assertNutritionistId(nutritionistId);
    const { count } = await client.plan.updateMany({ where: { id, nutritionistId }, data });
    if (count === 0) return null;
    return findByIdForNutritionist(id, nutritionistId);
  }

  return {
    findAllForPatient,
    findByIdForNutritionist,
    create,
    updateForNutritionist,
  };
}

module.exports = createPlanRepository({ prisma });
module.exports.createPlanRepository = createPlanRepository;
