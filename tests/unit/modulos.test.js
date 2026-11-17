const express = require('express');
const request = require('supertest');

const { STATUS, STATUS_VALIDOS, TRANSICOES, podeTransitar, podeAtribuir } = require('../../src/domain/statusEntrega');
const { AppError, NaoEncontradoError, ValidacaoError, TransicaoInvalidaError } = require('../../src/errors/AppError');
const { calcularDistanciaKm, estimarTempoMinutos } = require('../../src/services/entregaCalculos');
const { gerarNumeroPedido } = require('../../src/services/numeroPedido');
const asyncHandler = require('../../src/middleware/asyncHandler');
const validate = require('../../src/middleware/validate');
const { errorHandler, notFoundHandler } = require('../../src/middleware/errorHandler');
const schemas = require('../../src/validators/entregaSchemas');

describe('domain/statusEntrega', () => {
    it('expõe todos os status e a tabela de transições', () => {
        expect(STATUS_VALIDOS).toHaveLength(5);
        expect(Object.keys(TRANSICOES).sort()).toEqual([...STATUS_VALIDOS].sort());
    });

    it.each([
        ['PENDENTE', 'ATRIBUIDA', true],
        ['PENDENTE', 'CANCELADA', true],
        ['PENDENTE', 'ENTREGUE', false],
        ['ATRIBUIDA', 'EM_TRANSITO', true],
        ['ATRIBUIDA', 'PENDENTE', true],
        ['EM_TRANSITO', 'ENTREGUE', true],
        ['EM_TRANSITO', 'PENDENTE', false],
        ['ENTREGUE', 'PENDENTE', false],
        ['ENTREGUE', 'CANCELADA', false],
        ['CANCELADA', 'PENDENTE', false],
        ['PENDENTE', 'PENDENTE', false],
        ['DESCONHECIDO', 'PENDENTE', false]
    ])('podeTransitar(%s, %s) = %s', (de, para, esperado) => {
        expect(podeTransitar(de, para)).toBe(esperado);
    });

    it('podeAtribuir só em PENDENTE e ATRIBUIDA', () => {
        expect(podeAtribuir(STATUS.PENDENTE)).toBe(true);
        expect(podeAtribuir(STATUS.ATRIBUIDA)).toBe(true);
        expect(podeAtribuir(STATUS.EM_TRANSITO)).toBe(false);
        expect(podeAtribuir(STATUS.ENTREGUE)).toBe(false);
    });
});

describe('errors/AppError', () => {
    it('AppError usa 500 por padrão e não expõe a mensagem', () => {
        const e = new AppError('x');
        expect(e).toMatchObject({ status: 500, expose: false, name: 'AppError' });
    });
    it('AppError aceita status explícito', () => {
        expect(new AppError('x', 418)).toMatchObject({ status: 418, expose: true });
    });
    it('NaoEncontradoError', () => {
        expect(new NaoEncontradoError()).toMatchObject({ status: 404, message: 'Recurso não encontrado' });
        expect(new NaoEncontradoError('a').message).toBe('a');
    });
    it('ValidacaoError', () => {
        expect(new ValidacaoError()).toMatchObject({ status: 400, campos: [], message: 'Dados inválidos' });
        expect(new ValidacaoError([{ campo: 'a' }], 'm')).toMatchObject({ campos: [{ campo: 'a' }], message: 'm' });
    });
    it('TransicaoInvalidaError', () => {
        expect(new TransicaoInvalidaError()).toMatchObject({ status: 409, message: 'Transição de status inválida' });
        expect(new TransicaoInvalidaError('a').message).toBe('a');
    });
});

describe('services/entregaCalculos', () => {
    it('distância zero para o mesmo ponto', () => {
        expect(calcularDistanciaKm({ lat: 1, lng: 1 }, { lat: 1, lng: 1 })).toBe(0);
    });
    it('1 grau de latitude ≈ 111,19 km', () => {
        expect(calcularDistanciaKm({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })).toBeCloseTo(111.19, 1);
    });
    it('considera cos(lat): 1 grau de longitude em São Paulo ≈ 102 km (corrige B3)', () => {
        const d = calcularDistanciaKm({ lat: -23.55, lng: -46.63 }, { lat: -23.55, lng: -45.63 });
        expect(d).toBeGreaterThan(100);
        expect(d).toBeLessThan(104);
    });
    it('estima 2 min/km, arredondando para cima', () => {
        expect(estimarTempoMinutos(10)).toBe(20);
        expect(estimarTempoMinutos(10.1)).toBe(21);
        expect(estimarTempoMinutos(0)).toBe(0);
    });
    it('retorna null sem distância', () => {
        expect(estimarTempoMinutos(null)).toBeNull();
        expect(estimarTempoMinutos(undefined)).toBeNull();
    });
});

describe('services/numeroPedido', () => {
    it('usa prefixo, data e sufixo hexadecimal', () => {
        const n = gerarNumeroPedido(new Date('2026-03-05T10:00:00Z'));
        expect(n).toMatch(/^PED-20260305-[0-9A-F]{12}$/);
        expect(n.length).toBeLessThanOrEqual(50);
    });
    it('usa a data atual por padrão', () => {
        expect(gerarNumeroPedido()).toMatch(/^PED-\d{8}-[0-9A-F]{12}$/);
    });
    it('gera valores distintos', () => {
        const set = new Set(Array.from({ length: 1000 }, () => gerarNumeroPedido()));
        expect(set.size).toBe(1000);
    });
});

describe('middleware/asyncHandler', () => {
    it('encaminha rejeições ao next', async () => {
        const erro = new Error('x');
        const next = jest.fn();
        await asyncHandler(async () => { throw erro; })({}, {}, next);
        expect(next).toHaveBeenCalledWith(erro);
    });
    it('encaminha erros síncronos ao next', async () => {
        const erro = new Error('x');
        const next = jest.fn();
        await asyncHandler(() => { throw erro; })({}, {}, next);
        expect(next).toHaveBeenCalledWith(erro);
    });
    it('não chama next quando o handler resolve', async () => {
        const next = jest.fn();
        await asyncHandler(async () => 1)({}, {}, next);
        expect(next).not.toHaveBeenCalled();
    });
});

describe('middleware/validate', () => {
    it('substitui req pelos dados validados', () => {
        const req = { params: { id: '5' }, body: {} };
        const next = jest.fn();
        validate({ params: schemas.idParams })(req, {}, next);
        expect(req.params.id).toBe(5);
        expect(next).toHaveBeenCalledWith();
    });
    it('ignora partes sem schema', () => {
        const next = jest.fn();
        validate({})({}, {}, next);
        expect(next).toHaveBeenCalledWith();
    });
    it('agrega erros de várias partes', () => {
        const next = jest.fn();
        validate({ params: schemas.idParams, body: schemas.statusBody })(
            { params: { id: 'x' }, body: { status: 'Z' } }, {}, next);
        const erro = next.mock.calls[0][0];
        expect(erro).toBeInstanceOf(ValidacaoError);
        expect(erro.campos.map((c) => c.campo)).toEqual(['id', 'status']);
    });
    it('usa (raiz) quando o erro não tem caminho', () => {
        const next = jest.fn();
        validate({ body: schemas.statusBody })({ body: 'texto' }, {}, next);
        expect(next.mock.calls[0][0].campos[0].campo).toBe('(raiz)');
    });
});

describe('validators/entregaSchemas', () => {
    it('listarQuery rejeita motorista_id inválido e placa vazia', () => {
        expect(schemas.listarQuery.safeParse({ motorista_id: '0' }).success).toBe(false);
        expect(schemas.listarQuery.safeParse({ veiculo: '' }).success).toBe(false);
    });
    it('pedidoParams exige valor', () => {
        expect(schemas.pedidoParams.safeParse({ numeroPedido: 'PED-1' }).success).toBe(true);
        expect(schemas.pedidoParams.safeParse({ numeroPedido: '' }).success).toBe(false);
    });
    it('atribuirBody rejeita placa com mais de 7 caracteres', () => {
        const r = schemas.atribuirBody.safeParse({ veiculo_placa: 'ABCDEFGH', motorista_id: 1 });
        expect(r.success).toBe(false);
    });
    it('criarBody aceita campos nulos opcionais', () => {
        const r = schemas.criarBody.safeParse({
            origem_endereco: ' A ', destino_endereco: 'B', origem_lat: null, peso_kg: null, observacoes: null
        });
        expect(r.success).toBe(true);
        expect(r.data.origem_endereco).toBe('A');
    });
});

describe('middleware/errorHandler', () => {
    function appCom(rota) {
        const app = express();
        app.use(express.json());
        app.get('/x', rota);
        app.post('/x', (req, res, next) => next(new Error('x')));
        app.use(notFoundHandler);
        app.use(errorHandler);
        return app;
    }

    it('expõe a mensagem apenas de erros marcados como expose', async () => {
        const res = await request(appCom((req, res, next) => next(new NaoEncontradoError('nada')))).get('/x');
        expect(res.status).toBe(404);
        expect(res.body).toEqual({ error: 'nada' });
    });
    it('inclui campos de validação', async () => {
        const res = await request(appCom((req, res, next) => next(new ValidacaoError([{ campo: 'a', mensagem: 'm' }])))).get('/x');
        expect(res.status).toBe(400);
        expect(res.body.campos).toEqual([{ campo: 'a', mensagem: 'm' }]);
    });
    it('oculta mensagem e stack em erros internos', async () => {
        const res = await request(appCom((req, res, next) => next(new Error('interno')))).get('/x');
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ error: 'Erro interno do servidor' });
    });
    it('trata JSON inválido como 400 sem vazar o stack', async () => {
        const res = await request(appCom((req, res) => res.end())).post('/x')
            .set('Content-Type', 'application/json').send('{ruim');
        expect(res.status).toBe(400);
        expect(res.body.stack).toBeUndefined();
    });
    it('delega ao próximo handler se os headers já foram enviados', () => {
        const res = { headersSent: true };
        const next = jest.fn();
        const erro = new Error('x');
        errorHandler(erro, { method: 'GET', url: '/' }, res, next);
        expect(next).toHaveBeenCalledWith(erro);
    });
    it('notFoundHandler devolve 404', async () => {
        const res = await request(appCom((req, res) => res.end())).get('/nao-existe');
        expect(res.status).toBe(404);
        expect(res.body).toMatchObject({ error: 'Rota não encontrada', path: '/nao-existe', method: 'GET' });
    });
});
