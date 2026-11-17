describe('config/logger', () => {
    const envOriginal = { ...process.env };

    afterEach(() => {
        process.env = { ...envOriginal };
        jest.resetModules();
    });

    function carregar(env) {
        delete process.env.LOG_LEVEL;
        Object.assign(process.env, env);
        let logger;
        jest.isolateModules(() => { logger = require('../../src/config/logger'); });
        return logger;
    }

    it('fica em silêncio em NODE_ENV=test', () => {
        expect(carregar({ NODE_ENV: 'test' }).level).toBe('silent');
    });
    it('usa info fora de teste', () => {
        expect(carregar({ NODE_ENV: 'production' }).level).toBe('info');
    });
    it('respeita LOG_LEVEL', () => {
        expect(carregar({ NODE_ENV: 'test', LOG_LEVEL: 'debug' }).level).toBe('debug');
    });
    it('faz redact de authorization e body', () => {
        const linhas = [];
        const destino = { write: (l) => linhas.push(l) };
        process.env.LOG_LEVEL = 'info';
        let logger;
        jest.isolateModules(() => {
            jest.doMock('pino', () => {
                const original = jest.requireActual('pino');
                return (opts) => original(opts, destino);
            });
            logger = require('../../src/config/logger');
        });
        logger.info({ body: { senha: '123' }, req: { headers: { authorization: 'Bearer x' } } }, 'teste');
        const saida = linhas.join('');
        expect(saida).not.toContain('123');
        expect(saida).not.toContain('Bearer x');
        expect(saida).toContain('[REDACTED]');
    });
});
