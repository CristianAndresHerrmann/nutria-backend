const { createConsultationService } = require('./consultation.service');

const OWN_PATIENT = '11111111-1111-1111-1111-111111111111';
const OTHER_PATIENT = '22222222-2222-2222-2222-222222222222';

const patients = [
  { id: OWN_PATIENT, nutritionistId: 'nutri-1' },
  { id: OTHER_PATIENT, nutritionistId: 'nutri-2' },
];

// Repositorios en memoria que filtran por nutricionista como los reales. Los
// hábitos se guardan como lo hace Prisma: en habitsSet y con compliance pending
// por default. touchedPatients registra a qué paciente se le movió updatedAt.
function buildService(initialConsultations = []) {
  const consultations = initialConsultations.map((consultation) => ({ ...consultation }));
  const touchedPatients = [];
  let nextId = 1;

  const owns = (patientId, nutritionistId) =>
    patients.some((patient) => patient.id === patientId && patient.nutritionistId === nutritionistId);
  const ownConsultation = (id, patientId, nutritionistId) =>
    owns(patientId, nutritionistId)
      ? consultations.find((consultation) => consultation.id === id && consultation.patientId === patientId) || null
      : null;

  const consultationRepository = {
    findAllForPatient: vi.fn(async (patientId, nutritionistId) =>
      owns(patientId, nutritionistId)
        ? consultations
            .filter((consultation) => consultation.patientId === patientId)
            .sort((a, b) => b.date - a.date || b.createdAt - a.createdAt)
        : [],
    ),
    findByIdForPatient: vi.fn(async (id, patientId, nutritionistId) => ownConsultation(id, patientId, nutritionistId)),
    create: vi.fn(async (patientId, nutritionistId, data, habits) => {
      const consultation = {
        id: `q-${nextId}`,
        patientId,
        ...data,
        createdAt: new Date(Date.UTC(2026, 9, 19, 12, nextId)),
        habitsSet: habits.map((habit, index) => ({ id: `h-${nextId}-${index}`, compliance: 'pending', ...habit })),
      };
      nextId += 1;
      consultations.push(consultation);
      touchedPatients.push(patientId);
      return consultation;
    }),
    updateForPatient: vi.fn(async (id, patientId, nutritionistId, data) => {
      const consultation = ownConsultation(id, patientId, nutritionistId);
      if (!consultation) return null;
      touchedPatients.push(patientId);
      return Object.assign(consultation, data);
    }),
  };

  const service = createConsultationService({
    patientRepository: {
      findByIdForNutritionist: async (id, nutritionistId) =>
        patients.find((patient) => patient.id === id && patient.nutritionistId === nutritionistId) || null,
    },
    consultationRepository,
  });

  return { service, repository: consultationRepository, consultations, touchedPatients };
}

// Lo que deja el schema Zod: los opcionales que no vienen, en null.
function input(data) {
  return {
    motivation: null,
    decisionOrigin: null,
    perceivedObstacle: null,
    mainHabit: null,
    observations: null,
    ...data,
  };
}

const firstVisit = input({
  date: new Date('2026-09-01T00:00:00.000Z'),
  type: 'first',
  motivation: 'Sentirse con más energía',
  mainHabit: 'Picoteo por la tarde',
});
const othersConsultation = {
  id: 'q-other',
  patientId: OTHER_PATIENT,
  ...firstVisit,
  createdAt: new Date('2026-09-01T12:00:00.000Z'),
  habitsSet: [],
};

describe('consultation.service — aislamiento por nutricionista', () => {
  it.each([
    ['list', (service) => service.list(OTHER_PATIENT, 'nutri-1')],
    ['get', (service) => service.get('q-other', OTHER_PATIENT, 'nutri-1')],
    ['create', (service) => service.create(OTHER_PATIENT, 'nutri-1', { ...firstVisit, habits: [] })],
    ['update', (service) => service.update('q-other', OTHER_PATIENT, 'nutri-1', firstVisit)],
  ])('%s sobre un paciente de otro nutricionista responde 404 sin tocar sus consultas', async (_op, run) => {
    const { service, repository, consultations, touchedPatients } = buildService([othersConsultation]);

    await expect(run(service)).rejects.toMatchObject({ status: 404, message: 'Paciente no encontrado' });
    expect(repository.findAllForPatient).not.toHaveBeenCalled();
    expect(repository.findByIdForPatient).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.updateForPatient).not.toHaveBeenCalled();
    expect(consultations).toEqual([othersConsultation]);
    expect(touchedPatients).toEqual([]);
  });

  it.each([
    ['get', (service) => service.get('q-other', OWN_PATIENT, 'nutri-1')],
    ['update', (service) => service.update('q-other', OWN_PATIENT, 'nutri-1', firstVisit)],
  ])('%s con el id de una consulta de otro paciente responde 404', async (_op, run) => {
    const { service, consultations, touchedPatients } = buildService([othersConsultation]);

    await expect(run(service)).rejects.toMatchObject({ status: 404, message: 'Consulta no encontrada' });
    expect(consultations).toEqual([othersConsultation]);
    expect(touchedPatients).toEqual([]);
  });

  it('un paciente inexistente responde el mismo 404 que uno ajeno', async () => {
    const { service } = buildService();

    await expect(service.list('33333333-3333-3333-3333-333333333333', 'nutri-1')).rejects.toMatchObject({
      status: 404,
      message: 'Paciente no encontrado',
    });
  });
});

describe('consultation.service — registro de consultas y hábitos pautados', () => {
  it('registra una primera y un seguimiento con hábitos, y el historial los lista del más reciente al más antiguo', async () => {
    const { service, repository } = buildService([othersConsultation]);

    await service.create(OWN_PATIENT, 'nutri-1', {
      ...firstVisit,
      habits: [{ description: 'Caminar 30 minutos' }, { description: 'Fruta en la merienda' }],
    });
    await service.create(OWN_PATIENT, 'nutri-1', {
      ...input({ date: new Date('2026-10-01T00:00:00.000Z'), type: 'follow_up' }),
      habits: [{ description: 'Tomar agua en el trabajo' }],
    });

    const history = await service.list(OWN_PATIENT, 'nutri-1');

    expect(repository.create).toHaveBeenCalledWith(
      OWN_PATIENT,
      'nutri-1',
      firstVisit,
      [{ description: 'Caminar 30 minutos' }, { description: 'Fruta en la merienda' }],
    );
    expect(history.map(({ type, habits }) => ({ type, habits: habits.map((habit) => habit.description) }))).toEqual([
      { type: 'follow_up', habits: ['Tomar agua en el trabajo'] },
      { type: 'first', habits: ['Caminar 30 minutos', 'Fruta en la merienda'] },
    ]);
    expect(history.flatMap((consultation) => consultation.habits).every((habit) => habit.compliance === 'pending')).toBe(
      true,
    );
  });

  it('devuelve los hábitos como habits, sin el nombre interno de la relación', async () => {
    const { service } = buildService();

    const created = await service.create(OWN_PATIENT, 'nutri-1', { ...firstVisit, habits: [{ description: 'Caminar' }] });

    expect(created).not.toHaveProperty('habitsSet');
    expect(created.habits).toEqual([{ id: 'h-1-0', description: 'Caminar', compliance: 'pending' }]);
  });

  it('guarda una consulta sin mediciones ni hábitos ni campos opcionales (RNF-09)', async () => {
    const { service, repository } = buildService();
    const minimal = input({ date: new Date('2026-10-01T00:00:00.000Z'), type: 'follow_up' });

    const created = await service.create(OWN_PATIENT, 'nutri-1', { ...minimal, habits: [] });

    expect(repository.create).toHaveBeenCalledWith(OWN_PATIENT, 'nutri-1', minimal, []);
    expect(created).toMatchObject({ type: 'follow_up', observations: null, habits: [] });
  });

  it('guardar o editar una consulta actualiza al paciente (última actualización)', async () => {
    const { service, touchedPatients } = buildService();

    const created = await service.create(OWN_PATIENT, 'nutri-1', { ...firstVisit, habits: [] });
    await service.update(created.id, OWN_PATIENT, 'nutri-1', { ...firstVisit, observations: 'Corrige el motivo' });

    expect(touchedPatients).toEqual([OWN_PATIENT, OWN_PATIENT]);
  });

  it('el PUT reemplaza los campos y conserva los hábitos', async () => {
    const { service } = buildService();
    const created = await service.create(OWN_PATIENT, 'nutri-1', { ...firstVisit, habits: [{ description: 'Caminar' }] });

    const updated = await service.update(created.id, OWN_PATIENT, 'nutri-1', input({ date: firstVisit.date, type: 'first' }));

    expect(updated).toMatchObject({ motivation: null, mainHabit: null });
    expect(updated.habits.map((habit) => habit.description)).toEqual(['Caminar']);
  });

  it('get devuelve la consulta propia con sus hábitos', async () => {
    const { service } = buildService();
    const created = await service.create(OWN_PATIENT, 'nutri-1', { ...firstVisit, habits: [{ description: 'Caminar' }] });

    expect(await service.get(created.id, OWN_PATIENT, 'nutri-1')).toEqual(created);
  });
});
