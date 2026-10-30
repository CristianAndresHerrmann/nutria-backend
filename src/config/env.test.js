const { spawnSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '../..');

function environment(overrides) {
  const env = { ...process.env };
  for (const name of ['NODE_ENV', 'JWT_SECRET', 'IA_TIMEOUT_MS']) delete env[name];
  for (const [name, value] of Object.entries(overrides)) {
    if (value !== undefined) env[name] = value;
  }
  return env;
}

// Un proceso nuevo por escenario: require() cachea el módulo CommonJS y los
// tests deben cargarlo con el entorno que tendría un arranque real.
function readConfig(overrides) {
  return spawnSync(process.execPath, ['-e', `
    const config = require('./src/config/env');
    console.log(JSON.stringify({
      nodeEnv: config.nodeEnv,
      iaTimeoutMs: config.iaTimeoutMs,
      secretWasPreserved: config.jwtSecret === process.env.JWT_SECRET,
    }));
  `], { cwd: root, env: environment(overrides), encoding: 'utf8', timeout: 5000 });
}

describe('configuración de arranque (AUD-009)', () => {
  describe.each(['development', 'production', undefined])('NODE_ENV=%s', (nodeEnv) => {
    it.each([undefined, '', ' \t\n '])('rechaza JWT_SECRET ausente o vacío (%s)', (secret) => {
      const result = readConfig({ NODE_ENV: nodeEnv, JWT_SECRET: secret });

      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toContain('JWT_SECRET es obligatorio');
    });

    it('acepta una clave configurada y conserva su contenido exacto', () => {
      const result = readConfig({ NODE_ENV: nodeEnv, JWT_SECRET: ' clave-ficticia-con-espacios ' });

      expect(result.status).toBe(0);
      expect(JSON.parse(result.stdout)).toMatchObject({ nodeEnv: nodeEnv || 'development', secretWasPreserved: true });
    });
  });

  it('permite cargar la configuración sin clave cuando NODE_ENV=test, sin inventar una', () => {
    const result = readConfig({ NODE_ENV: 'test' });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({ nodeEnv: 'test', secretWasPreserved: true });
  });

  it('usa el timeout por defecto de 3000 ms cuando no está configurado', () => {
    const result = readConfig({ NODE_ENV: 'production', JWT_SECRET: 'clave-ficticia' });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).iaTimeoutMs).toBe(3000);
  });

  it('respeta un timeout configurado explícitamente', () => {
    const result = readConfig({ NODE_ENV: 'production', JWT_SECRET: 'clave-ficticia', IA_TIMEOUT_MS: '7500' });

    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout).iaTimeoutMs).toBe(7500);
  });

  it('el servidor real termina antes de escuchar si falta JWT_SECRET', () => {
    const result = spawnSync(process.execPath, ['src/server.js'], {
      cwd: root,
      env: { ...environment({ NODE_ENV: 'production' }), PORT: '0' },
      encoding: 'utf8',
      timeout: 5000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('JWT_SECRET es obligatorio');
    expect(result.stdout).not.toContain('escuchando');
  });
});
