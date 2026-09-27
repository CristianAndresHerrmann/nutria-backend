const { createHealthService } = require('./health.service');
const AppError = require('../utils/AppError');

describe('health.service — comunicación con el servicio de IA', () => {
  it('devuelve el estado del servicio de IA con la latencia medida', async () => {
    const iaClient = { getJson: vi.fn(async () => ({ status: 'ok', service: 'nutria-ia', timestamp: 'x' })) };
    const service = createHealthService({ iaClient });

    const result = await service.getIaStatus();

    expect(iaClient.getJson).toHaveBeenCalledWith('/health');
    expect(result).toMatchObject({
      status: 'ok',
      service: 'nutria-backend',
      ia: { status: 'ok', service: 'nutria-ia' },
    });
    expect(result.ia.latencyMs).toBeGreaterThanOrEqual(0);
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
