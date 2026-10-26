// Lista blanca: aunque el repositorio ya selecciona solo estos campos, el hash
// de la contraseña o el rol no pueden salir por un cambio en el select.
function serializeNutritionistAccount({ id, name, email, active, createdAt }) {
  return { id, name, email, active, createdAt };
}

function serializeNutritionistAccounts(accounts) {
  return accounts.map(serializeNutritionistAccount);
}

module.exports = { serializeNutritionistAccount, serializeNutritionistAccounts };
