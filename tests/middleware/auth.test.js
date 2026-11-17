const jwt = require('jsonwebtoken');
const authMiddleware = require('../../src/middleware/auth');

const SECRET = 'segredo-de-teste-com-mais-de-32-caracteres!!';
const ISSUER = 'rotalog';
const AUDIENCE = 'rotalog-api-entregas';

function createRes() {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
}

function assinar(payload = {}, options = {}) {
    const opts = {
        algorithm: 'HS256',
        issuer: ISSUER,
        audience: AUDIENCE,
        subject: '42',
        expiresIn: '1h',
        ...options
    };
    if (opts.subject === null) delete opts.subject; // permite assinar sem "sub"
    return jwt.sign({ nome: 'Maria', role: 'operador', ...payload }, SECRET, opts);
}

function reqCom(token) {
    return { headers: { authorization: 'Bearer ' + token } };
}

describe('authMiddleware', () => {
    const envOriginal = { ...process.env };
    let next;
    let res;

    beforeEach(() => {
        process.env.JWT_SECRET = SECRET;
        process.env.JWT_ISSUER = ISSUER;
        process.env.JWT_AUDIENCE = AUDIENCE;
        next = jest.fn();
        res = createRes();
        jest.spyOn(console, 'warn').mockImplementation(() => {});
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(console, 'log').mockImplementation(() => {});
    });

    afterEach(() => {
        process.env = { ...envOriginal };
        jest.restoreAllMocks();
    });

    function esperarNegado() {
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({ error: 'Não autorizado' });
        expect(next).not.toHaveBeenCalled();
    }

    describe('sem bypass por ambiente', () => {
        it.each(['development', 'test', 'production', undefined])(
            'exige token quando NODE_ENV=%s',
            (env) => {
                if (env === undefined) delete process.env.NODE_ENV;
                else process.env.NODE_ENV = env;

                authMiddleware({ headers: {} }, res, next);

                esperarNegado();
            }
        );
    });

    describe('header Authorization', () => {
        it('nega quando o header não existe', () => {
            authMiddleware({ headers: {} }, res, next);
            esperarNegado();
        });

        it.each([
            ['apenas uma parte', 'tokensemprefixo'],
            ['mais de duas partes', 'Bearer abc def'],
            ['esquema Basic', 'Basic abcdefghijkl'],
            ['esquema em minúsculas', 'bearer abcdefghijkl'],
            ['token vazio', 'Bearer ']
        ])('nega quando o header tem %s', (_, header) => {
            authMiddleware({ headers: { authorization: header } }, res, next);
            esperarNegado();
        });
    });

    describe('verificação do token', () => {
        it('nega token arbitrário com 10+ caracteres (antes era aceito)', () => {
            authMiddleware(reqCom('aaaaaaaaaaaaaaaa'), res, next);
            esperarNegado();
        });

        it('nega token assinado com outro segredo', () => {
            const token = jwt.sign({ role: 'admin' }, 'outro-segredo-completamente-diferente-123', {
                issuer: ISSUER,
                audience: AUDIENCE,
                subject: '1'
            });
            authMiddleware(reqCom(token), res, next);
            esperarNegado();
        });

        it('nega token com a assinatura adulterada', () => {
            const [h, p, s] = assinar().split('.');
            const adulterada = s.slice(0, -2) + (s.endsWith('AA') ? 'BB' : 'AA');
            authMiddleware(reqCom([h, p, adulterada].join('.')), res, next);
            esperarNegado();
        });

        it('nega token expirado', () => {
            authMiddleware(reqCom(assinar({}, { expiresIn: -10 })), res, next);
            esperarNegado();
        });

        it('nega token com issuer diferente', () => {
            authMiddleware(reqCom(assinar({}, { issuer: 'atacante' })), res, next);
            esperarNegado();
        });

        it('nega token com audience diferente', () => {
            authMiddleware(reqCom(assinar({}, { audience: 'outra-api' })), res, next);
            esperarNegado();
        });

        it('nega token HS512 (algoritmo fixado em HS256)', () => {
            authMiddleware(reqCom(assinar({}, { algorithm: 'HS512' })), res, next);
            esperarNegado();
        });

        it('nega token "alg: none"', () => {
            const enc = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
            const token =
                enc({ alg: 'none', typ: 'JWT' }) +
                '.' +
                enc({ sub: '1', role: 'admin', iss: ISSUER, aud: AUDIENCE }) +
                '.';
            authMiddleware(reqCom(token), res, next);
            esperarNegado();
        });

        it('nega token sem sub', () => {
            authMiddleware(reqCom(assinar({}, { subject: null })), res, next);
            esperarNegado();
        });

        it('nega token sem role', () => {
            authMiddleware(reqCom(assinar({ role: undefined })), res, next);
            esperarNegado();
        });

        it('não expõe o motivo da recusa ao cliente', () => {
            authMiddleware(reqCom(assinar({}, { expiresIn: -10 })), res, next);

            expect(JSON.stringify(res.json.mock.calls)).not.toMatch(/expired/i);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('TokenExpiredError'));
        });

        it('não escreve o token no log', () => {
            const token = assinar({}, { issuer: 'atacante' });
            authMiddleware(reqCom(token), res, next);

            const logado = console.warn.mock.calls.flat().join(' ');
            expect(logado).not.toContain(token);
        });
    });

    describe('token válido', () => {
        it('chama next() e monta req.user a partir do payload verificado', () => {
            const req = reqCom(assinar({ nome: 'Maria', role: 'motorista' }));

            authMiddleware(req, res, next);

            expect(next).toHaveBeenCalledTimes(1);
            expect(res.status).not.toHaveBeenCalled();
            expect(req.user).toEqual({ id: '42', nome: 'Maria', role: 'motorista' });
        });

        it('não devolve mais o usuário admin fabricado', () => {
            const req = reqCom(assinar({ nome: 'João', role: 'operador' }));

            authMiddleware(req, res, next);

            expect(req.user.role).not.toBe('admin');
            expect(req.user.nome).toBe('João');
        });
    });

    describe('configuração inválida', () => {
        it.each(['JWT_SECRET', 'JWT_ISSUER', 'JWT_AUDIENCE'])(
            'falha fechado com 500 quando %s não está definido',
            (variavel) => {
                delete process.env[variavel];

                authMiddleware(reqCom(assinar()), res, next);

                expect(res.status).toHaveBeenCalledWith(500);
                expect(res.json).toHaveBeenCalledWith({ error: 'Erro interno' });
                expect(next).not.toHaveBeenCalled();
            }
        );
    });
});
