const { createRecommendationRepository } = require('./recommendation.repository');

// Los tests del servicio usan un repositorio fake que ya aplica el aislamiento.
// Estos verifican la otra mitad: que la consulta real a Prisma lleve el
// nutricionista en el where, y que se corte si llega sin él (Prisma ignoraría el
// filtro y devolvería las privadas de todos).
function createFakePrisma({ updatedCount = 1 } = {}) {
  return {
    clinicalRecommendation: {
      findMany: vi.fn(async () => []),
      findFirst: vi.fn(async () => ({ id: 'r-1' })),
      create: vi.fn(async ({ data }) => ({ id: 'r-1', ...data })),
      updateMany: vi.fn(async () => ({ count: updatedCount })),
    },
  };
}

const VISIBLE_TO_NUTRI_1 = { OR: [{ nutritionistId: null }, { nutritionistId: 'nutri-1' }] };
const data = { pathologyId: 'celiaquia', title: 'Ejemplo', text: 'Texto' };

describe('recommendation.repository — aislamiento por nutricionista', () => {
  it('el listado trae comunes y propias y, por defecto, solo las vigentes', async () => {
    const prisma = createFakePrisma();
    const repository = createRecommendationRepository({ prisma });

    await repository.findVisible('nutri-1');
    await repository.findVisible('nutri-1', { pathologyId: 'celiaquia', includeInactive: true });

    expect(prisma.clinicalRecommendation.findMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ where: { ...VISIBLE_TO_NUTRI_1, active: true } }),
    );
    expect(prisma.clinicalRecommendation.findMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ where: { ...VISIBLE_TO_NUTRI_1, pathologyId: 'celiaquia' } }),
    );
  });

  it('la búsqueda por id se limita a comunes y propias', async () => {
    const prisma = createFakePrisma();
    const repository = createRecommendationRepository({ prisma });

    await repository.findVisibleById('r-1', 'nutri-1');

    expect(prisma.clinicalRecommendation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r-1', ...VISIBLE_TO_NUTRI_1 } }),
    );
  });

  it('el alta guarda al nutricionista como dueño', async () => {
    const prisma = createFakePrisma();
    const repository = createRecommendationRepository({ prisma });

    await repository.createPrivate('nutri-1', data);

    expect(prisma.clinicalRecommendation.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: { ...data, nutritionistId: 'nutri-1' } }),
    );
  });

  it('la edición filtra por dueño y devuelve null si no es propia', async () => {
    const prisma = createFakePrisma({ updatedCount: 0 });
    const repository = createRecommendationRepository({ prisma });

    expect(await repository.updateOwn('r-1', 'nutri-1', data)).toBeNull();
    expect(prisma.clinicalRecommendation.updateMany).toHaveBeenCalledWith({
      where: { id: 'r-1', nutritionistId: 'nutri-1' },
      data,
    });
    expect(prisma.clinicalRecommendation.findFirst).not.toHaveBeenCalled();
  });

  it('la edición propia devuelve la recomendación actualizada', async () => {
    const prisma = createFakePrisma();
    const repository = createRecommendationRepository({ prisma });

    expect(await repository.updateOwn('r-1', 'nutri-1', data)).toEqual({ id: 'r-1' });
    expect(prisma.clinicalRecommendation.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'r-1', nutritionistId: 'nutri-1' } }),
    );
  });

  it.each([undefined, null, ''])('corta toda consulta sin nutritionistId (%s)', async (nutritionistId) => {
    const prisma = createFakePrisma();
    const repository = createRecommendationRepository({ prisma });

    expect(() => repository.findVisible(nutritionistId)).toThrow('consulta sin nutritionistId');
    expect(() => repository.findVisibleById('r-1', nutritionistId)).toThrow('consulta sin nutritionistId');
    expect(() => repository.createPrivate(nutritionistId, data)).toThrow('consulta sin nutritionistId');
    await expect(repository.updateOwn('r-1', nutritionistId, data)).rejects.toThrow('consulta sin nutritionistId');
    expect(prisma.clinicalRecommendation.findMany).not.toHaveBeenCalled();
    expect(prisma.clinicalRecommendation.updateMany).not.toHaveBeenCalled();
  });
});
