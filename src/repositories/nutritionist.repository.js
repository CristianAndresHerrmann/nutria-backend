const prisma = require('../lib/prisma');

function findByEmail(email) {
  return prisma.nutritionist.findUnique({ where: { email } });
}

module.exports = { findByEmail };
