const { calculateAge } = require('../utils/age');

// nutritionistId no viaja: es el id del propio nutricionista autenticado
// (siempre igual al del token), no aporta nada al cliente y es ruido en el
// contrato de la API.
function serializePatient(patient) {
  const {
    nutritionistId: _nutritionistId,
    referenceWeight,
    birthDate,
    ...rest
  } = patient;

  return {
    ...rest,
    birthDate,
    age: calculateAge(birthDate),
    referenceWeight: referenceWeight === null ? null : Number(referenceWeight),
  };
}

function serializePatients(patients) {
  return patients.map(serializePatient);
}

module.exports = { serializePatient, serializePatients };
