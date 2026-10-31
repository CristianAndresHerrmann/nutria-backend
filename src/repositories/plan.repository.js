const { PlanStatus } = require('@prisma/client');
const prisma = require('../lib/prisma');

// El plan completo, en el orden en que se muestra: las comidas en el orden del
// enum (desayuno a cena), y las opciones y sus ítems por posición. Un ítem de
// receta trae su nombre: la receta es del nutricionista y no se copia (DA-16
// copia alimentos y grupos), así que se lee la vigente. Los hallazgos viajan
// con el plan porque el editor los marca sobre sus ítems y opciones; su orden lo
// fija el serializer. De las generaciones, solo el resumen de la última: el
// contexto enviado y la respuesta cruda son trazabilidad (RF-41), no parte del
// plan.
const PLAN_INCLUDE = {
  meals: {
    orderBy: { mealType: 'asc' },
    include: {
      options: {
        orderBy: { order: 'asc' },
        include: {
          items: {
            orderBy: { order: 'asc' },
            include: { recipe: { select: { id: true, name: true, availableInCatalog: true } } },
          },
        },
      },
    },
  },
  findings: { orderBy: [{ detectedAt: 'asc' }, { id: 'asc' }] },
  aiGenerations: {
    orderBy: { generatedAt: 'desc' },
    take: 1,
    select: { provider: true, model: true, templateVersion: true, validationResult: true, generatedAt: true },
  },
};

// Lo que lista el historial de planes de un paciente.
const PLAN_SUMMARY_SELECT = { id: true, patientId: true, status: true, createdAt: true, updatedAt: true };

// Como en patient.repository: Prisma ignora un filtro undefined, y un where
// { id, nutritionistId: undefined } buscaría planes de cualquier nutricionista.
// Se corta acá con un 500 en vez de devolver datos de otro.
function assertNutritionistId(nutritionistId) {
  if (typeof nutritionistId !== 'string' || nutritionistId.length === 0) {
    throw new Error('plan.repository: consulta sin nutritionistId');
  }
}

// Una comida con sus opciones e ítems, con los ids que ya trae (los genera el
// servicio para validar el plan en memoria antes de guardarlo).
function mealCreateData({ id, mealType, instructions, options }) {
  return {
    id,
    mealType,
    instructions,
    options: {
      create: options.map((option) => ({
        id: option.id,
        order: option.order,
        description: option.description,
        items: { create: option.items },
      })),
    },
  };
}

// Las generaciones y las ediciones escriben el plan, su contenido y sus
// hallazgos en una sola transacción: nunca queda un plan a medias (RNF-02). Los
// hallazgos de un plan sin cambios se reemplazan con replaceFindings.
function createPlanRepository({ prisma: client }) {
  function findAllForPatient(patientId, nutritionistId) {
    assertNutritionistId(nutritionistId);
    return client.plan.findMany({
      where: { patientId, nutritionistId },
      select: PLAN_SUMMARY_SELECT,
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    });
  }

  // Filtra por paciente además de nutricionista: la ruta es
  // /patients/:id/plans/:planId, y un plan de otro paciente del mismo
  // nutricionista no se encuentra bajo este.
  function findByIdForPatient(id, patientId, nutritionistId, db = client) {
    assertNutritionistId(nutritionistId);
    return db.plan.findFirst({ where: { id, patientId, nutritionistId }, include: PLAN_INCLUDE });
  }

  // Borrador generado por la IA (T37): el plan, su contenido, los hallazgos de
  // la validación inicial y la traza de la generación. El estado (draft) lo pone
  // la base. Si el paciente no es de este nutricionista, la FK compuesta
  // (patient_id, nutritionist_id) rechaza el alta.
  function createGenerated(nutritionistId, { patientId, fields, meals, findings, generation }) {
    assertNutritionistId(nutritionistId);
    return client.$transaction(async (tx) => {
      const plan = await tx.plan.create({
        data: { ...fields, patientId, nutritionistId, meals: { create: meals.map(mealCreateData) } },
        select: { id: true },
      });
      if (findings.length > 0) {
        await tx.finding.createMany({ data: findings.map((finding) => ({ ...finding, planId: plan.id })) });
      }
      await tx.aiGeneration.create({ data: { ...generation, planId: plan.id, patientId, nutritionistId } });
      return findByIdForPatient(plan.id, patientId, nutritionistId, tx);
    });
  }

  // Traza de una generación fallida (DA-31): sin plan, colgada del paciente. La
  // misma FK compuesta impide registrarla sobre un paciente ajeno.
  function recordFailedGeneration(patientId, nutritionistId, generation) {
    assertNutritionistId(nutritionistId);
    return client.aiGeneration.create({ data: { ...generation, patientId, nutritionistId } });
  }

  // Reemplazo completo del borrador: textos, comidas, opciones, ítems y
  // hallazgos. updateMany lleva el aislamiento y el estado en el where: un plan
  // ajeno, de otro paciente o ya no editable afecta 0 filas y no se toca nada.
  // Los hallazgos y las comidas se borran antes de recrearlas (las opciones y
  // los ítems caen en cascada).
  function replaceDraft(id, patientId, nutritionistId, { fields, meals, findings }) {
    assertNutritionistId(nutritionistId);
    return client.$transaction(async (tx) => {
      const { count } = await tx.plan.updateMany({
        where: { id, patientId, nutritionistId, status: PlanStatus.draft },
        data: fields,
      });
      if (count === 0) return null;

      await tx.finding.deleteMany({ where: { planId: id } });
      await tx.planMeal.deleteMany({ where: { planId: id } });
      for (const meal of meals) {
        await tx.planMeal.create({ data: { ...mealCreateData(meal), planId: id } });
      }
      if (findings.length > 0) {
        await tx.finding.createMany({ data: findings.map((finding) => ({ ...finding, planId: id })) });
      }
      return findByIdForPatient(id, patientId, nutritionistId, tx);
    });
  }

  // Los hallazgos se recalculan en cada revalidación (RF-46): se reemplazan
  // todos los del plan, nunca se acumulan ni se descartan uno a uno. El plan se
  // bloquea por fila antes de borrar: dos revalidaciones del mismo borrador se
  // serializan, sin bloquear otros planes ni modificar updatedAt. El filtro
  // conserva el dueño y el estado editable. Devuelve los hallazgos creados, o
  // null si el plan no es un borrador del nutricionista.
  function replaceFindings(planId, nutritionistId, findings) {
    assertNutritionistId(nutritionistId);
    return client.$transaction(async (tx) => {
      const [plan] = await tx.$queryRaw`
        SELECT "id" FROM "plan"
        WHERE "id" = ${planId}::uuid
          AND "nutritionist_id" = ${nutritionistId}::uuid
          AND "status" = ${PlanStatus.draft}::"plan_status"
        FOR UPDATE
      `;
      if (!plan) return null;

      await tx.finding.deleteMany({ where: { planId } });
      return tx.finding.createManyAndReturn({ data: findings.map((finding) => ({ ...finding, planId })) });
    });
  }

  return {
    findAllForPatient,
    findByIdForPatient,
    createGenerated,
    recordFailedGeneration,
    replaceDraft,
    replaceFindings,
  };
}

module.exports = createPlanRepository({ prisma });
module.exports.createPlanRepository = createPlanRepository;
