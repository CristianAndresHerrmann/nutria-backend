const { createClinicalRuleRepository } = require('./clinicalRule.repository');

describe('clinicalRule.repository.findActiveForPathologies', () => {
  it('busca las reglas vigentes de las patologías pedidas, de las dos severidades', async () => {
    const prisma = { clinicalRule: { findMany: vi.fn(async () => []) } };
    const repository = createClinicalRuleRepository({ prisma });

    await repository.findActiveForPathologies(['celiaquia']);

    expect(prisma.clinicalRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pathologyId: { in: ['celiaquia'] }, active: true } }),
    );
  });

  it('trae la severidad y la fuente que el motor usa en el hallazgo', async () => {
    const prisma = { clinicalRule: { findMany: vi.fn(async () => []) } };
    const repository = createClinicalRuleRepository({ prisma });

    await repository.findActiveForPathologies(['diabetes']);

    expect(prisma.clinicalRule.findMany.mock.calls[0][0].select).toEqual({
      id: true,
      pathologyId: true,
      foodId: true,
      foodGroupId: true,
      severity: true,
      source: true,
    });
  });

  it('sin patologías no consulta la base', async () => {
    const prisma = { clinicalRule: { findMany: vi.fn() } };
    const repository = createClinicalRuleRepository({ prisma });

    await expect(repository.findActiveForPathologies([])).resolves.toEqual([]);
    expect(prisma.clinicalRule.findMany).not.toHaveBeenCalled();
  });
});
