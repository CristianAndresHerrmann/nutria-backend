const { withBmi } = require('../utils/bmi');

// value es Decimal en Prisma: viaja como número, igual que referenceWeight.
function serializeValue(measurement) {
  return { ...measurement, value: Number(measurement.value) };
}

// El IMC necesita las tallas del paciente, así que se calcula sobre el
// histórico completo y no fila por fila.
function serializeMeasurements(measurements) {
  return withBmi(measurements.map(serializeValue));
}

module.exports = { serializeMeasurements };
