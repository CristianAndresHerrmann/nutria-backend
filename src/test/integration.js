const { Prisma } = require('@prisma/client');
const { randomUUID } = require('node:crypto');
const prisma = require('../lib/prisma');

async function clearDatabase() {
  const [database] = await prisma.$queryRaw`SELECT current_database() AS name, current_schema() AS schema`;
  if (database.name !== 'nutria_test' || database.schema !== 'public') {
    throw new Error('Limpieza permitida solo en nutria_test.public');
  }
  // Nombres del schema generado, nunca de una entrada externa. Se conserva
  // _prisma_migrations; CASCADE resuelve las dependencias entre todas las tablas.
  const tables = Prisma.dmmf.datamodel.models.map((model) => `"${model.dbName || model.name}"`);
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.join(', ')} CASCADE`);
}

async function snapshotDatabase() {
  const entries = await Promise.all(Prisma.dmmf.datamodel.models.map(async ({ name }) => {
    const delegate = name[0].toLowerCase() + name.slice(1);
    return [name, await prisma[delegate].findMany({ orderBy: { id: 'asc' } })];
  }));
  return Object.fromEntries(entries);
}

async function createCatalog() {
  const group = await prisma.foodGroup.create({ data: { name: 'Grupo ficticio' } });
  const food = await prisma.food.create({ data: { name: 'Alimento ficticio', foodGroupId: group.id } });
  const pathology = await prisma.pathology.create({ data: { name: 'Patología ficticia' } });
  return { group, food, pathology };
}

async function createTenant(label) {
  const nutritionist = await prisma.nutritionist.create({
    data: { name: `Profesional ficticio ${label}`, email: `${label}@example.test`, passwordHash: 'unused-integration-hash' },
  });
  const patient = await prisma.patient.create({
    data: { nutritionistId: nutritionist.id, firstName: `Paciente ficticio ${label}`, lastName: 'Prueba', birthDate: new Date('1990-01-01'), updatedAt: new Date('2020-01-01') },
  });
  return { nutritionist, patient };
}

function draftContent() {
  const optionId = randomUUID();
  const itemId = randomUUID();
  return {
    fields: { introduction: 'Borrador ficticio incompleto' },
    meals: [{
      id: randomUUID(), mealType: 'lunch', instructions: null,
      options: [{ id: optionId, order: 1, description: null, items: [{ id: itemId, order: 1, type: 'unrecognized', originalText: 'Texto ficticio' }] }],
    }],
    findings: [{ type: 'unrecognized_item', severity: 'warning', optionItemId: itemId, message: 'Ítem ficticio sin reconocer' }],
  };
}

function generationData(overrides = {}) {
  return {
    contextSent: { meal_types: ['lunch'] }, provider: 'fake', model: 'fake-test', templateVersion: 'v1',
    rawResponse: '{}', durationMs: 0, inputTokens: 0, outputTokens: null,
    result: 'success', validationResult: 'warnings', ...overrides,
  };
}

module.exports = { prisma, clearDatabase, snapshotDatabase, createCatalog, createTenant, draftContent, generationData };
