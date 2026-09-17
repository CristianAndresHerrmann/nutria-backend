// birthDate es una columna @db.Date: Prisma la entrega como Date en medianoche
// UTC. Comparar en UTC evita que un cumpleaños se corra un día según la zona
// horaria del proceso que corre el cálculo.
function calculateAge(birthDate, now = new Date()) {
  if (!birthDate) return null;

  const birth = new Date(birthDate);
  let age = now.getUTCFullYear() - birth.getUTCFullYear();

  const beforeBirthdayThisYear =
    now.getUTCMonth() < birth.getUTCMonth() ||
    (now.getUTCMonth() === birth.getUTCMonth() && now.getUTCDate() < birth.getUTCDate());

  if (beforeBirthdayThisYear) age -= 1;

  return age;
}

function isMinor(birthDate, now = new Date()) {
  const age = calculateAge(birthDate, now);
  return age !== null && age < 18;
}

module.exports = { calculateAge, isMinor };
