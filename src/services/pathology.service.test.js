const { createPathologyService } = require('./pathology.service');

// Catálogo común de solo lectura para los nutricionistas.
const pathologies = [{ id: 'celiaquia', name: 'Celiaquía', description: null }];
const repository = {
  async findAll() {
    return pathologies;
  },
  async findById(id) {
    return pathologies.find((item) => item.id === id) || null;
  },
};

describe('pathology.service', () => {
  const service = createPathologyService({ pathologyRepository: repository });

  it('lista y obtiene patologías', async () => {
    expect(await service.list()).toEqual(pathologies);
    expect(await service.get('celiaquia')).toEqual(pathologies[0]);
  });

  it('responde 404 para una patología inexistente', async () => {
    await expect(service.get('no-existe')).rejects.toMatchObject({ status: 404, message: 'Patología no encontrada' });
  });

  it('no expone alta ni edición', () => {
    expect(Object.keys(service).sort()).toEqual(['get', 'list']);
  });
});
