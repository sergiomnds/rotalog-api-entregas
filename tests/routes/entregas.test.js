const request = require('supertest');
const express = require('express');

jest.mock('../../src/services/entregaService');

const service = require('../../src/services/entregaService');
const router = require('../../src/routes/entregas');
const { errorHandler } = require('../../src/middleware/errorHandler');
const { NaoEncontradoError, TransicaoInvalidaError } = require('../../src/errors/AppError');

const app = express();
app.use(express.json());
app.use('/api/entregas', router);
app.use(errorHandler);

describe('routes/entregas', () => {
    beforeEach(() => {
        jest.resetAllMocks();
    });

    describe('GET /', () => {
        it('lista sem filtros', async () => {
            service.listar.mockResolvedValue([{ id: 1 }]);
            const res = await request(app).get('/api/entregas');
            expect(res.status).toBe(200);
            expect(res.body).toEqual([{ id: 1 }]);
            expect(service.listar).toHaveBeenCalledWith({});
        });

        it('normaliza filtros (placa e status em maiúsculo)', async () => {
            service.listar.mockResolvedValue([]);
            await request(app).get('/api/entregas?veiculo=abc1234&status=pendente&motorista_id=7');
            expect(service.listar).toHaveBeenCalledWith({ veiculo: 'ABC1234', status: 'PENDENTE', motorista_id: 7 });
        });

        it('400 para status repetido (corrige B1)', async () => {
            const res = await request(app).get('/api/entregas?status=a&status=b');
            expect(res.status).toBe(400);
            expect(res.body.campos[0].campo).toBe('status');
            expect(service.listar).not.toHaveBeenCalled();
        });

        it('400 para status inexistente', async () => {
            const res = await request(app).get('/api/entregas?status=XYZ');
            expect(res.status).toBe(400);
        });

        it('500 genérico em erro inesperado, sem vazar a mensagem', async () => {
            service.listar.mockRejectedValue(new Error('segredo interno'));
            const res = await request(app).get('/api/entregas');
            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: 'Erro interno do servidor' });
        });
    });

    describe('GET /stats', () => {
        it('retorna estatísticas', async () => {
            service.estatisticas.mockResolvedValue({ total: 5, por_status: [], gerado_em: 'x' });
            const res = await request(app).get('/api/entregas/stats');
            expect(res.status).toBe(200);
            expect(res.body.total).toBe(5);
        });
    });

    describe('GET /:id', () => {
        it('retorna a entrega', async () => {
            service.buscarPorId.mockResolvedValue({ id: 1 });
            const res = await request(app).get('/api/entregas/1');
            expect(res.status).toBe(200);
            expect(service.buscarPorId).toHaveBeenCalledWith(1);
        });

        it('404 quando não existe', async () => {
            service.buscarPorId.mockRejectedValue(new NaoEncontradoError('Entrega não encontrada'));
            const res = await request(app).get('/api/entregas/1');
            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: 'Entrega não encontrada' });
        });

        it('400 para id não numérico', async () => {
            const res = await request(app).get('/api/entregas/abc');
            expect(res.status).toBe(400);
            expect(res.body.campos[0].campo).toBe('id');
        });
    });

    describe('GET /pedido/:numeroPedido', () => {
        it('retorna a entrega', async () => {
            service.buscarPorPedido.mockResolvedValue({ id: 1 });
            const res = await request(app).get('/api/entregas/pedido/PED-1');
            expect(res.status).toBe(200);
            expect(service.buscarPorPedido).toHaveBeenCalledWith('PED-1');
        });

        it('404 quando não existe', async () => {
            service.buscarPorPedido.mockRejectedValue(new NaoEncontradoError('Pedido não encontrado'));
            const res = await request(app).get('/api/entregas/pedido/X');
            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: 'Pedido não encontrado' });
        });
    });

    describe('POST /', () => {
        const base = { origem_endereco: 'A', destino_endereco: 'B' };

        it('201 ao criar', async () => {
            service.criar.mockResolvedValue({ id: 9 });
            const res = await request(app).post('/api/entregas').send(base);
            expect(res.status).toBe(201);
            expect(service.criar).toHaveBeenCalledWith(expect.objectContaining(base));
        });

        it('aceita coordenada 0 (corrige B2)', async () => {
            service.criar.mockResolvedValue({ id: 9 });
            const res = await request(app).post('/api/entregas')
                .send({ ...base, origem_lat: 0, origem_lng: 0, destino_lat: 0, destino_lng: 0 });
            expect(res.status).toBe(201);
            expect(service.criar).toHaveBeenCalledWith(expect.objectContaining({ origem_lat: 0, origem_lng: 0 }));
        });

        it('400 sem endereços, listando os campos', async () => {
            const res = await request(app).post('/api/entregas').send({ origem_endereco: 'A' });
            expect(res.status).toBe(400);
            expect(res.body.error).toBe('Dados inválidos');
            expect(res.body.campos.map((c) => c.campo)).toEqual(['destino_endereco']);
        });

        it.each([
            ['coordenada como string (B5)', { origem_lat: 'abc' }],
            ['latitude fora da faixa', { origem_lat: 91 }],
            ['longitude fora da faixa', { destino_lng: -181 }],
            ['peso negativo', { peso_kg: -1 }]
        ])('400 para %s', async (_nome, extra) => {
            const res = await request(app).post('/api/entregas').send({ ...base, ...extra });
            expect(res.status).toBe(400);
            expect(service.criar).not.toHaveBeenCalled();
        });

        it('500 sem expor detalhes (corrige B10)', async () => {
            service.criar.mockRejectedValue(new Error('boom'));
            const res = await request(app).post('/api/entregas').send(base);
            expect(res.status).toBe(500);
            expect(res.body).toEqual({ error: 'Erro interno do servidor' });
        });
    });

    describe('PUT /:id', () => {
        it('atualiza', async () => {
            service.atualizar.mockResolvedValue({ id: 1 });
            const res = await request(app).put('/api/entregas/1').send({ peso_kg: 5, observacoes: null });
            expect(res.status).toBe(200);
            expect(service.atualizar).toHaveBeenCalledWith(1, { peso_kg: 5, observacoes: null });
        });

        it('400 para peso inválido (corrige B6)', async () => {
            const res = await request(app).put('/api/entregas/1').send({ peso_kg: 'pesado' });
            expect(res.status).toBe(400);
        });

        it('404', async () => {
            service.atualizar.mockRejectedValue(new NaoEncontradoError('Entrega não encontrada'));
            expect((await request(app).put('/api/entregas/1').send({})).status).toBe(404);
        });
    });

    describe('PATCH /:id/status', () => {
        it('altera o status', async () => {
            service.mudarStatus.mockResolvedValue({ id: 1 });
            const res = await request(app).patch('/api/entregas/1/status').send({ status: 'EM_TRANSITO' });
            expect(res.status).toBe(200);
            expect(service.mudarStatus).toHaveBeenCalledWith(1, 'EM_TRANSITO');
        });

        it('400 para status inválido', async () => {
            const res = await request(app).patch('/api/entregas/1/status').send({ status: 'XYZ' });
            expect(res.status).toBe(400);
        });

        it('409 para transição inválida (corrige B7)', async () => {
            service.mudarStatus.mockRejectedValue(new TransicaoInvalidaError('não permitida'));
            const res = await request(app).patch('/api/entregas/1/status').send({ status: 'PENDENTE' });
            expect(res.status).toBe(409);
            expect(res.body).toEqual({ error: 'não permitida' });
        });
    });

    describe('PATCH /:id/atribuir', () => {
        const body = { veiculo_placa: 'abc1234', motorista_id: 3, motorista_nome: 'Ana', veiculo_modelo: 'Van' };

        it('atribui, normalizando a placa', async () => {
            service.atribuir.mockResolvedValue({ id: 1 });
            const res = await request(app).patch('/api/entregas/1/atribuir').send(body);
            expect(res.status).toBe(200);
            expect(service.atribuir).toHaveBeenCalledWith(1, { ...body, veiculo_placa: 'ABC1234' });
        });

        it('400 sem placa e motorista', async () => {
            const res = await request(app).patch('/api/entregas/1/atribuir').send({});
            expect(res.status).toBe(400);
            expect(res.body.campos.map((c) => c.campo).sort()).toEqual(['motorista_id', 'veiculo_placa']);
        });

        it('409 quando não atribuível (corrige B9)', async () => {
            service.atribuir.mockRejectedValue(new TransicaoInvalidaError('não pode'));
            expect((await request(app).patch('/api/entregas/1/atribuir').send(body)).status).toBe(409);
        });
    });

    describe('DELETE /:id', () => {
        it('cancela', async () => {
            service.cancelar.mockResolvedValue({ id: 1, status: 'CANCELADA' });
            const res = await request(app).delete('/api/entregas/1');
            expect(res.status).toBe(200);
            expect(res.body).toEqual({ message: 'Entrega cancelada', entrega: { id: 1, status: 'CANCELADA' } });
        });

        it('409 para entrega já entregue', async () => {
            service.cancelar.mockRejectedValue(new TransicaoInvalidaError('não pode'));
            expect((await request(app).delete('/api/entregas/1')).status).toBe(409);
        });
    });
});
