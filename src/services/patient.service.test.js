const { createPatientService } = require('./patient.service');

function createFakePatientRepository(patients) {
  return {
    async findAllByNutritionist(nutritionistId) {
      return patients.filter((patient) => patient.nutritionistId === nutritionistId);
    },
    async findByIdForNutritionist(id, nutritionistId) {
      return (
        patients.find((patient) => patient.id === id && patient.nutritionistId === nutritionistId) || null
      );
    },
  };
}

const patients = [
  { id: '11111111-1111-1111-1111-111111111111', nutritionistId: 'nutri-1', firstName: 'Lucía' },
  { id: '22222222-2222-2222-2222-222222222222', nutritionistId: 'nutri-2', firstName: 'Ajeno' },
];

function buildService() {
  return createPatientService({ patientRepository: createFakePatientRepository(patients) });
}

describe('patient.service — aislamiento por nutricionista', () => {
  it('lista únicamente los pacientes del nutricionista autenticado', async () => {
    const service = buildService();

    const result = await service.listForNutritionist('nutri-1');

    expect(result).toEqual([patients[0]]);
  });

  it('devuelve el paciente cuando pertenece al nutricionista autenticado', async () => {
    const service = buildService();

    const result = await service.getForNutritionist(patients[0].id, 'nutri-1');

    expect(result).toEqual(patients[0]);
  });

  it('devuelve 404 (nunca los datos) al pedir, con el id real, un paciente de otro nutricionista', async () => {
    const service = buildService();

    await expect(service.getForNutritionist(patients[1].id, 'nutri-1')).rejects.toMatchObject({
      status: 404,
      message: 'Not found',
    });
  });

  it('devuelve 404 para un id con formato inválido, indistinguible del caso "no existe"', async () => {
    const service = buildService();

    await expect(service.getForNutritionist('no-es-un-uuid', 'nutri-1')).rejects.toMatchObject({
      status: 404,
      message: 'Not found',
    });
  });
});
