// En Prisma la relación se llama habitsSet, para distinguirla de habitsEvaluated
// (los hábitos que esa consulta evalúa, Incremento 5). En la API son simplemente
// los hábitos pautados de la consulta.
function serializeConsultation({ habitsSet, ...consultation }) {
  return { ...consultation, habits: habitsSet };
}

function serializeConsultations(consultations) {
  return consultations.map(serializeConsultation);
}

module.exports = { serializeConsultation, serializeConsultations };
