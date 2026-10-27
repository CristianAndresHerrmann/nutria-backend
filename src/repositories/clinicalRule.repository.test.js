const { createClinicalRuleRepository } = require('./clinicalRule.repository');

describe('clinicalRule.repository.findActiveProhibitedForPathologies', () => {
  it('busca solo las reglas vigentes que prohíben, de las patologías pedidas', async () => {
    const prisma = { clinicalRule: { findMany: vi.fn(async () => []) } };
    const repository = createClinicalRuleRepository({ prisma });

    await repository.findActiveProhibitedForPathologies(['celiaquia']);

    expect(prisma.clinicalRule.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { pathologyId: { in: ['celiaquia'] }, severity: 'prohibited', active: true } }),
    );
  });

  it('sin patologías no consulta la base', async () => {
    const prisma = { clinicalRule: { findMany: vi.fn() } };
    const repository = createClinicalRuleRepository({ prisma });

    await expect(repository.findActiveProhibitedForPathologies([])).resolves.toEqual([]);
    expect(prisma.clinicalRule.findMany).not.toHaveBeenCalled();
  });
});
