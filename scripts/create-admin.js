const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');
const { z } = require('zod');
const { accountEmail, accountPassword } = require('../src/schemas/common.schema');

// Crea (o pone al día) la cuenta de administrador a partir de variables de
// entorno. No va en el seed: el seed tiene una contraseña de desarrollo en el
// repo, y staging es público. Acá las credenciales solo existen en el entorno
// de quien lo corre (RNF-06), y el script nunca las imprime.
//
// No duplica la cuenta: volver a ejecutarlo restablece la contraseña y revoca
// sus tokens anteriores. Un email que ya es de una nutricionista no se
// promueve a administrador: falla y no toca nada.

const adminEnvSchema = z.object({
  ADMIN_EMAIL: accountEmail({ required: 'Falta ADMIN_EMAIL' }),
  ADMIN_PASSWORD: accountPassword,
  ADMIN_NAME: z
    .string()
    .trim()
    .optional()
    .transform((value) => value || 'Administrador'),
});

async function ensureAdmin(client, { email, password, name }) {
  const existing = await client.nutritionist.findUnique({ where: { email } });

  if (existing && existing.role !== 'admin') {
    throw new Error(`${email} ya es una cuenta de nutricionista: no se convierte en administrador.`);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  if (existing) {
    await client.nutritionist.update({
      where: { id: existing.id },
      data: { passwordHash, active: true, tokenVersion: { increment: 1 } },
    });
    return 'updated';
  }

  await client.nutritionist.create({ data: { name, email, passwordHash, role: 'admin' } });
  return 'created';
}

async function main() {
  const parsed = adminEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => `${issue.path[0]}: ${issue.message}`);
    throw new Error(`Variables de entorno inválidas para crear el administrador:\n${messages.join('\n')}`);
  }
  const { ADMIN_EMAIL: email, ADMIN_PASSWORD: password, ADMIN_NAME: name } = parsed.data;

  const prisma = new PrismaClient();
  try {
    const result = await ensureAdmin(prisma, { email, password, name });
    console.log(
      result === 'created'
        ? `Administrador ${email} creado.`
        : `Administrador ${email} ya existía: contraseña puesta al día y cuenta activa.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { ensureAdmin, adminEnvSchema };
