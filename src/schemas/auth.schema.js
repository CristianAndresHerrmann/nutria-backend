const { z } = require('zod');

const loginSchema = z.object({
  email: z
    .string({ error: 'Email y contraseña son requeridos' })
    .min(1, 'Email y contraseña son requeridos')
    .email('El email no tiene un formato válido'),
  password: z
    .string({ error: 'Email y contraseña son requeridos' })
    .min(1, 'Email y contraseña son requeridos'),
});

module.exports = { loginSchema };
