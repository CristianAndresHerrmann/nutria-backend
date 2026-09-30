const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const SEED_PASSWORD = '123456aA!';

// Dos nutricionistas con pacientes propios: permite verificar a mano que cada uno
// ve y edita solo los suyos (aislamiento por nutricionista, RNF-05).
const SEED_DATA = [
  {
    nutritionist: { name: 'Camila Ríos', email: 'nutricionista@nutria.com' },
    patients: [
      {
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
        firstName: 'Jorge',
        lastName: 'Ibarra',
        phone: '+54 342 555-0303',
        registrationComplete: false,
        dataCompletedAt: null,
      },
    ],
  },
  {
    nutritionist: { name: 'Martín Sosa', email: 'nutricionista2@nutria.com' },
    patients: [
      {
        firstName: 'Valeria',
        lastName: 'Acosta',
        birthDate: new Date('1985-11-02'),
        phone: '+54 342 555-0404',
        email: 'valeria.acosta@example.com',
        livesWith: 'Sola',
        goal: 'Aumentar masa muscular',
        referenceWeight: 61.0,
        attendsAccompanied: false,
        registrationComplete: true,
        dataCompletedAt: new Date(),
      },
      {
        firstName: 'Diego',
        lastName: 'Paredes',
        goal: 'Controlar glucemia',
        registrationComplete: false,
        dataCompletedAt: null,
      },
    ],
  },
];

async function main() {
  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  for (const { nutritionist: data, patients } of SEED_DATA) {
    const nutritionist = await prisma.nutritionist.upsert({
      where: { email: data.email },
      update: { passwordHash },
      create: { ...data, passwordHash },
    });

    await prisma.patient.deleteMany({ where: { nutritionistId: nutritionist.id } });
    await prisma.patient.createMany({
      data: patients.map((patient) => ({ ...patient, nutritionistId: nutritionist.id })),
    });

    console.log(`Seed: ${nutritionist.email} con ${patients.length} pacientes.`);
  }

  console.log(`Contraseña de prueba de ambos nutricionistas: ${SEED_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
