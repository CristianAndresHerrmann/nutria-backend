const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const nutritionist = await prisma.nutritionist.upsert({
    where: { email: 'camila.rios@nutria.test' },
    update: {},
    create: {
      name: 'Camila Ríos',
      email: 'camila.rios@nutria.test',
      // Placeholder: el hash real se generará cuando se implemente el módulo de autenticación.
      passwordHash: 'seed-placeholder-hash',
    },
  });

  await prisma.patient.deleteMany({ where: { nutritionistId: nutritionist.id } });

  await prisma.patient.createMany({
    data: [
      {
        nutritionistId: nutritionist.id,
        firstName: 'Lucía',
        lastName: 'Fernández',
        birthDate: new Date('1992-03-14'),
        phone: '+54 342 555-0101',
        email: 'lucia.fernandez@example.com',
        livesWith: 'Pareja',
        goal: 'Bajar de peso',
        referenceWeight: 68.5,
        attendsAccompanied: false,
        registrationComplete: true,
        dataCompletedAt: new Date(),
      },
      {
        nutritionistId: nutritionist.id,
        firstName: 'Tomás',
        lastName: 'Gómez',
        birthDate: new Date('2012-05-10'), // menor de edad
        livesWith: 'Padres',
        goal: 'Mejorar hábitos alimentarios',
        referenceWeight: 45.0,
        guardianName: 'María Gómez',
        guardianRelationship: 'Madre',
        guardianContact: '+54 342 555-0202',
        attendsAccompanied: true,
        registrationComplete: true,
        dataCompletedAt: new Date(),
      },
      {
        nutritionistId: nutritionist.id,
        firstName: 'Jorge',
        lastName: 'Ibarra',
        phone: '+54 342 555-0303',
        registrationComplete: false,
        dataCompletedAt: null,
      },
    ],
  });

  console.log('Seed completado: 1 nutritionist, 3 patients (1 menor de edad, 1 con registro incompleto).');
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
