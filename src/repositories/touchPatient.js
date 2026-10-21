// Registrar algo del paciente (una consulta, una medición) cuenta como
// actualización: su "última actualización" (y el orden del listado) sale de
// patient.updated_at, que Prisma solo mueve al escribir la fila del paciente.
// Se llama dentro de la misma transacción que la escritura, filtrando también
// por el nutricionista. Ver
// docs/decisiones/ultima-actualizacion-del-paciente-incluye-consultas.md.
function touchPatient(db, patientId, nutritionistId) {
  return db.patient.updateMany({ where: { id: patientId, nutritionistId }, data: { updatedAt: new Date() } });
}

module.exports = touchPatient;
