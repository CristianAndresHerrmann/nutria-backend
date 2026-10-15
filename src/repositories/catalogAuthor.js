// Resguardo de los repositorios de catálogos comunes. Las lecturas no filtran
// por nutricionista (el catálogo es de todos), pero toda escritura lleva el autor:
// el alta lo guarda y la edición filtra por él. Prisma ignora los filtros con
// valor undefined, así que un update con createdById vacío editaría el ítem de
// cualquiera: se corta acá, como assertNutritionistId en patient.repository.
function assertAuthorId(repositoryName, nutritionistId) {
  if (typeof nutritionistId !== 'string' || nutritionistId.length === 0) {
    throw new Error(`${repositoryName}: escritura sin nutricionista autor`);
  }
}

module.exports = { assertAuthorId };
