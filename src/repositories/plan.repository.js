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

// Las comidas, opciones, ítems y generaciones se escriben con la generación y el
// editor, que definen sus transacciones. Los hallazgos, con replaceFindings.
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

  // Los hallazgos se recalculan en cada revalidación (RF-46): se reemplazan
  // todos los del plan, nunca se acumulan ni se descartan uno a uno. El plan se
  // vuelve a buscar con su nutricionista dentro de la transacción, así un id
  // ajeno no borra ni escribe nada. Devuelve los hallazgos creados, o null si
  // el plan no es del nutricionista.
  function replaceFindings(planId, nutritionistId, findings) {
    assertNutritionistId(nutritionistId);
    return client.$transaction(async (tx) => {
      const plan = await tx.plan.findFirst({ where: { id: planId, nutritionistId }, select: { id: true } });
      if (!plan) return null;

      await tx.finding.deleteMany({ where: { planId } });
      return tx.finding.createManyAndReturn({ data: findings.map((finding) => ({ ...finding, planId })) });
    });
  }

  return {
    findAllForPatient,
    findByIdForNutritionist,
    create,
    updateForNutritionist,
    replaceFindings,
  };
}

module.exports = createPlanRepository({ prisma });
module.exports.createPlanRepository = createPlanRepository;
