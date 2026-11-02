const prisma = require('../lib/prisma');

// Reglas clínicas por patología (RF-47). Catálogo común, como las patologías
// (DA-15): no se filtra por nutricionista. Las carga el seed (T35), con su ficha
// en docs/reglas-clinicas.md del repo raíz.
function createClinicalRuleRepository({ prisma: client }) {
  // Las reglas vigentes de alguna de las patologías, de las dos severidades. El
  // motor las evalúa todas; la generación (T37) excluye del catálogo permitido
  // solo lo que alcanzan las prohibitivas.
  async function findActiveForPathologies(pathologyIds) {
    if (pathologyIds.length === 0) return [];
    return client.clinicalRule.findMany({
      where: { pathologyId: { in: pathologyIds }, active: true },
      select: { id: true, pathologyId: true, foodId: true, foodGroupId: true, severity: true, source: true },
      orderBy: { id: 'asc' },
    });
  }

  return { findActiveForPathologies };
}

module.exports = createClinicalRuleRepository({ prisma });
module.exports.createClinicalRuleRepository = createClinicalRuleRepository;
