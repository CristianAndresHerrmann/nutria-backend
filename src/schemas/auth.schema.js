const { z } = require('zod');
const { accountEmail } = require('./common.schema');

const REQUIRED_MESSAGE = 'Email y contraseña son requeridos';

// La contraseña no pasa por accountPassword: el login no revela la política, y
// una contraseña corta simplemente no coincide.
const loginSchema = z.object({
  email: accountEmail({ required: REQUIRED_MESSAGE }),
  password: z.string({ error: REQUIRED_MESSAGE }).min(1, REQUIRED_MESSAGE),
});

module.exports = { loginSchema };
