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

describe('patient.service — alta y edición', () => {
  function buildServiceWithPatients(initialPatients) {
    const store = initialPatients.map((patient) => ({ ...patient }));
    let nextId = 1;

    const repository = {
      async findAllByNutritionist(nutritionistId) {
        return store.filter((patient) => patient.nutritionistId === nutritionistId);
      },
      async findByIdForNutritionist(id, nutritionistId) {
        return store.find((patient) => patient.id === id && patient.nutritionistId === nutritionistId) || null;
      },
      async create(data) {
        const patient = { id: `generated-${nextId++}`, ...data };
        store.push(patient);
        return patient;
      },
      async updateForNutritionist(id, nutritionistId, data) {
        const index = store.findIndex((patient) => patient.id === id && patient.nutritionistId === nutritionistId);
        if (index === -1) return null;
        store[index] = { ...store[index], ...data };
        return store[index];
      },
    };

    return createPatientService({ patientRepository: repository });
  }

  it('crea un paciente asociado al nutricionista autenticado', async () => {
    const service = buildServiceWithPatients([]);

    const patient = await service.createForNutritionist('nutri-1', { firstName: 'Ana', lastName: 'Diaz' });

    expect(patient).toMatchObject({ nutritionistId: 'nutri-1', firstName: 'Ana', lastName: 'Diaz' });
  });

  it('actualiza un paciente propio', async () => {
    const existing = {
      id: '33333333-3333-3333-3333-333333333333',
      nutritionistId: 'nutri-1',
      firstName: 'Ana',
      registrationComplete: false,
      dataCompletedAt: null,
    };
    const service = buildServiceWithPatients([existing]);

    const updated = await service.updateForNutritionist(existing.id, 'nutri-1', {
      firstName: 'Ana María',
      registrationComplete: false,
    });

    expect(updated.firstName).toBe('Ana María');
  });

  it('devuelve 404 (nunca aplica el cambio) al editar, con el id real, un paciente de otro nutricionista', async () => {
    const existing = {
      id: '44444444-4444-4444-4444-444444444444',
      nutritionistId: 'nutri-2',
      firstName: 'Ajeno',
      registrationComplete: false,
      dataCompletedAt: null,
    };
    const service = buildServiceWithPatients([existing]);

    await expect(
      service.updateForNutritionist(existing.id, 'nutri-1', { firstName: 'Hackeado', registrationComplete: false }),
    ).rejects.toMatchObject({ status: 404, message: 'Not found' });
  });

  it('devuelve 404 al editar con un id de formato inválido', async () => {
    const service = buildServiceWithPatients([]);

    await expect(service.updateForNutritionist('no-es-un-uuid', 'nutri-1', {})).rejects.toMatchObject({
      status: 404,
    });
  });

  it('setea dataCompletedAt al pasar de incompleta a completa', async () => {
    const existing = {
      id: '55555555-5555-5555-5555-555555555555',
      nutritionistId: 'nutri-1',
      registrationComplete: false,
      dataCompletedAt: null,
    };
    const service = buildServiceWithPatients([existing]);

    const updated = await service.updateForNutritionist(existing.id, 'nutri-1', { registrationComplete: true });

    expect(updated.dataCompletedAt).toBeInstanceOf(Date);
  });

  it('conserva dataCompletedAt si la ficha ya estaba completa', async () => {
    const originalDate = new Date('2020-01-01T00:00:00.000Z');
    const existing = {
      id: '66666666-6666-6666-6666-666666666666',
      nutritionistId: 'nutri-1',
      registrationComplete: true,
      dataCompletedAt: originalDate,
    };
    const service = buildServiceWithPatients([existing]);

    const updated = await service.updateForNutritionist(existing.id, 'nutri-1', {
      registrationComplete: true,
      firstName: 'Actualizado',
    });

    expect(updated.dataCompletedAt).toBe(originalDate);
  });

  it('conserva dataCompletedAt al volver a marcar la ficha como incompleta', async () => {
    const originalDate = new Date('2020-01-01T00:00:00.000Z');
    const existing = {
      id: '77777777-7777-7777-7777-777777777777',
      nutritionistId: 'nutri-1',
      registrationComplete: true,
      dataCompletedAt: originalDate,
    };
    const service = buildServiceWithPatients([existing]);

    const updated = await service.updateForNutritionist(existing.id, 'nutri-1', { registrationComplete: false });

    expect(updated.dataCompletedAt).toBe(originalDate);
  });
});
