const { prisma, createCatalog, createTenant } = require('../test/integration');

it('citext compara y aplica unicidad sin distinguir mayúsculas en los catálogos', async () => {
  const { group, food, pathology } = await createCatalog();
  const { nutritionist } = await createTenant('owner');

  expect(await prisma.food.findFirst({ where: { name: food.name.toUpperCase() } })).toMatchObject({ id: food.id });
  expect(await prisma.foodGroup.findUnique({ where: { name: group.name.toUpperCase() } })).toMatchObject({ id: group.id });
  expect(await prisma.pathology.findUnique({ where: { name: pathology.name.toUpperCase() } })).toMatchObject({ id: pathology.id });
  await expect(prisma.foodGroup.create({ data: { name: group.name.toUpperCase() } })).rejects.toMatchObject({ code: 'P2002' });
  await expect(prisma.pathology.create({ data: { name: pathology.name.toUpperCase() } })).rejects.toMatchObject({ code: 'P2002' });
  await prisma.food.create({ data: { nutritionistId: nutritionist.id, name: 'Privado ficticio', foodGroupId: group.id } });
  await expect(prisma.food.create({ data: { nutritionistId: nutritionist.id, name: 'PRIVADO FICTICIO', foodGroupId: group.id } }))
    .rejects.toMatchObject({ code: 'P2002' });
});

it('RESTRICT impide borrar un alimento usado por una condición', async () => {
  const { food } = await createCatalog();
  const { patient } = await createTenant('owner');
  await prisma.patientCondition.create({ data: { patientId: patient.id, type: 'allergy', foodId: food.id } });

  await expect(prisma.food.delete({ where: { id: food.id } })).rejects.toMatchObject({ code: 'P2003' });
  expect(await prisma.food.findUnique({ where: { id: food.id } })).toEqual(food);
  expect(await prisma.patientCondition.count()).toBe(1);
});
