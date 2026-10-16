// Aviso de RF-45 (parte de la ficha): se señala cuando el paciente no tiene
// registrada ninguna patología, alergia, intolerancia ni medicación. Rechazos y
// preferencias no cuentan: no hablan de una restricción clínica. El aviso no
// bloquea nada; la confirmación antes de aprobar un plan es del Incremento 4.
const RESTRICTION_CONDITION_TYPES = ['pathology', 'allergy', 'intolerance'];

function isMissingClinicalData({ medication, restrictionConditionCount }) {
  const hasMedication = typeof medication === 'string' && medication.trim() !== '';
  return !hasMedication && restrictionConditionCount === 0;
}

module.exports = { RESTRICTION_CONDITION_TYPES, isMissingClinicalData };
