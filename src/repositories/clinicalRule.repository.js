const { RuleSeverity } = require('@prisma/client');
const prisma = require('../lib/prisma');

// Reglas clínicas por patología (RF-47). Catálogo común, como las patologías
// (DA-15): no se filtra por nutricionista. Las reglas se cargan en T35, que
// también define qué hallazgo produce cada severidad en el motor.
function createClinicalRuleRepository({ prisma: client }) {
  // Las reglas vigentes que prohíben algo en alguna de las patologías. La
  // generación (T37) excluye del catálogo permitido lo que alcanzan.
  async function findActiveProhibitedForPathologies(pathologyIds) {
    if (pathologyIds.length === 0) return [];
    return client.clinicalRule.findMany({
      where: { pathologyId: { in: pathologyIds }, severity: RuleSeverity.prohibited, active: true },
      select: { id: true, pathologyId: true, foodId: true, foodGroupId: true },
    });
  }

  return { findActiveProhibitedForPathologies };
}

module.exports = createClinicalRuleRepository({ prisma });
module.exports.createClinicalRuleRepository = createClinicalRuleRepository;
