const { createHealthService } = require('./health.service');
const AppError = require('../utils/AppError');

describe('health.service — comunicación con el servicio de IA', () => {
  it('devuelve el estado del servicio de IA con el proveedor, el modelo y la latencia medida', async () => {
    const iaClient = {
      getJson: vi.fn(async () => ({
        status: 'ok', service: 'nutria-ia', provider: 'openai', model: 'gpt-6-luna', timestamp: 'x',
      })),
    };
    const service = createHealthService({ iaClient });

    const result = await service.getIaStatus();

    expect(iaClient.getJson).toHaveBeenCalledWith('/health');
    expect(result).toMatchObject({
      status: 'ok',
      service: 'nutria-backend',
      ia: { status: 'ok', service: 'nutria-ia', provider: 'openai', model: 'gpt-6-luna' },
    });
    expect(result.ia.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('informa proveedor y modelo null si la versión desplegada de la IA no los informa', async () => {
    const iaClient = { getJson: vi.fn(async () => ({ status: 'ok', service: 'nutria-ia', timestamp: 'x' })) };

    const result = await createHealthService({ iaClient }).getIaStatus();

    expect(result.ia).toMatchObject({ provider: null, model: null });
  });

  it('propaga el 503 cuando el servicio de IA no está disponible', async () => {
    const unavailable = new AppError(503, 'El servicio de IA no está disponible', {
      code: 'IA_UNAVAILABLE',
      details: { reason: 'timeout' },
    });
    const service = createHealthService({
      iaClient: {
        getJson: vi.fn(async () => {
          throw unavailable;
        }),
      },
    });

    await expect(service.getIaStatus()).rejects.toBe(unavailable);
  });
});
