const consultations = require('./consultation.repository');
const { prisma, createTenant, snapshotDatabase } = require('../test/integration');

it('persiste consulta, hábitos, mediciones y updatedAt del paciente en una sola transacción', async () => {
  const { patient, nutritionist } = await createTenant('owner');
  const date = new Date('2026-01-01');
  const saved = await consultations.create(patient.id, nutritionist.id, { date, type: 'first' },
    [{ description: 'Hábito ficticio' }], [{ type: 'weight', value: 70, unit: 'kg' }]);

  expect(saved.habitsSet).toMatchObject([{ description: 'Hábito ficticio', compliance: 'pending' }]);
  expect(await prisma.measurement.findMany({ where: { consultationId: saved.id } })).toMatchObject([{ patientId: patient.id, date }]);
  expect((await prisma.patient.findUnique({ where: { id: patient.id } })).updatedAt.getTime()).toBeGreaterThan(patient.updatedAt.getTime());
});

it('una medición inválida revierte consulta y hábitos y conserva updatedAt', async () => {
  const { patient, nutritionist } = await createTenant('owner');
  const before = await snapshotDatabase();
  await expect(consultations.create(patient.id, nutritionist.id, { date: new Date('2026-01-01'), type: 'first' },
    [{ description: 'No debe persistir' }], [{ type: 'weight', value: -1 }]))
    .rejects.toThrow('measurement_value_chk');
  expect(await snapshotDatabase()).toEqual(before);
});
