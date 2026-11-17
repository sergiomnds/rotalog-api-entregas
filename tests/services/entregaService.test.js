jest.mock('../../src/models', () => ({
    Entrega: { findAll: jest.fn(), findByPk: jest.fn(), findOne: jest.fn(), create: jest.fn() },
    Rastreamento: { create: jest.fn() }
}));
jest.mock('../../src/config/database', () => ({
    sequelize: { transaction: jest.fn() }
}));
jest.mock('../../src/services/numeroPedido', () => ({ gerarNumeroPedido: jest.fn() }));

const { Entrega, Rastreamento } = require('../../src/models');
const { sequelize } = require('../../src/config/database');
const { gerarNumeroPedido } = require('../../src/services/numeroPedido');
const service = require('../../src/services/entregaService');
const { NaoEncontradoError, TransicaoInvalidaError } = require('../../src/errors/AppError');

const TX = { id: 'tx' };

function entregaFake(extra = {}) {
    return { id: 1, numero_pedido: 'PED-1', status: 'PENDENTE', save: jest.fn().mockResolvedValue(), ...extra };
}

describe('entregaService', () => {
    beforeEach(() => {
        jest.resetAllMocks();
        sequelize.transaction.mockImplementation(async (cb) => cb(TX));
        gerarNumeroPedido.mockReturnValue('PED-20260101-AAAA');
    });

    describe('listar', () => {
        it('sem filtros', async () => {
            Entrega.findAll.mockResolvedValue([]);
            await service.listar();
            expect(Entrega.findAll.mock.calls[0][0].where).toEqual({});
        });

        it('com todos os filtros', async () => {
            Entrega.findAll.mockResolvedValue([]);
            await service.listar({ veiculo: 'ABC1234', status: 'PENDENTE', motorista_id: 7 });
            expect(Entrega.findAll.mock.calls[0][0].where).toEqual({
                veiculo_placa: 'ABC1234', status: 'PENDENTE', motorista_id: 7
            });
        });
    });

    describe('buscarPorId / buscarPorPedido', () => {
        it('retorna a entrega', async () => {
            Entrega.findByPk.mockResolvedValue({ id: 1 });
            expect(await service.buscarPorId(1)).toEqual({ id: 1 });
        });
        it('lança NaoEncontradoError por id', async () => {
            Entrega.findByPk.mockResolvedValue(null);
            await expect(service.buscarPorId(1)).rejects.toBeInstanceOf(NaoEncontradoError);
        });
        it('retorna por número de pedido', async () => {
            Entrega.findOne.mockResolvedValue({ id: 1 });
            expect(await service.buscarPorPedido('PED-1')).toEqual({ id: 1 });
            expect(Entrega.findOne).toHaveBeenCalledWith({ where: { numero_pedido: 'PED-1' } });
        });
        it('lança NaoEncontradoError por pedido', async () => {
            Entrega.findOne.mockResolvedValue(null);
            await expect(service.buscarPorPedido('X')).rejects.toThrow('Pedido não encontrado');
        });
    });

    describe('criar', () => {
        const base = { origem_endereco: 'A', destino_endereco: 'B' };

        beforeEach(() => {
            Entrega.create.mockImplementation(async (d) => ({ id: 9, ...d }));
        });

        it('cria sem coordenadas, na transação, com evento inicial', async () => {
            const e = await service.criar(base);
            expect(e).toMatchObject({
                id: 9, numero_pedido: 'PED-20260101-AAAA', status: 'PENDENTE',
                distancia_km: null, tempo_estimado_minutos: null, peso_kg: null, observacoes: null
            });
            expect(Entrega.create).toHaveBeenCalledWith(expect.any(Object), { transaction: TX });
            expect(Rastreamento.create).toHaveBeenCalledWith(
                expect.objectContaining({ entrega_id: 9, evento: 'PEDIDO_CRIADO' }), { transaction: TX });
        });

        it('calcula distância (Haversine) e tempo', async () => {
            const e = await service.criar({
                ...base, origem_lat: 0, origem_lng: 0, destino_lat: 1, destino_lng: 0, peso_kg: 3, observacoes: 'x'
            });
            expect(e.distancia_km).toBeCloseTo(111.19, 1);
            expect(e.tempo_estimado_minutos).toBe(223);
            expect(e.origem_lat).toBe(0);
            expect(e.peso_kg).toBe(3);
            expect(e.observacoes).toBe('x');
        });

        it('não calcula distância com coordenadas parciais', async () => {
            const e = await service.criar({ ...base, origem_lat: 1, origem_lng: 1 });
            expect(e.distancia_km).toBeNull();
            expect(e.destino_lat).toBeNull();
        });

        it('tenta novamente em colisão de número de pedido', async () => {
            const colisao = Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' });
            Entrega.create.mockRejectedValueOnce(colisao);
            gerarNumeroPedido.mockReturnValueOnce('PED-1').mockReturnValueOnce('PED-2');
            const e = await service.criar(base);
            expect(e.numero_pedido).toBe('PED-2');
            expect(sequelize.transaction).toHaveBeenCalledTimes(2);
        });

        it('desiste após 3 colisões', async () => {
            const colisao = Object.assign(new Error('dup'), { name: 'SequelizeUniqueConstraintError' });
            Entrega.create.mockRejectedValue(colisao);
            await expect(service.criar(base)).rejects.toBe(colisao);
            expect(Entrega.create).toHaveBeenCalledTimes(3);
        });

        it('propaga erros que não são colisão sem repetir', async () => {
            Entrega.create.mockRejectedValue(new Error('db'));
            await expect(service.criar(base)).rejects.toThrow('db');
            expect(Entrega.create).toHaveBeenCalledTimes(1);
        });

        it('propaga rejeição nula sem quebrar', async () => {
            Entrega.create.mockRejectedValue(undefined);
            await expect(service.criar(base)).rejects.toBeUndefined();
        });
    });

    describe('atualizar', () => {
        it('atualiza apenas campos informados', async () => {
            const e = entregaFake({ origem_endereco: 'velho', peso_kg: 1 });
            Entrega.findByPk.mockResolvedValue(e);
            await service.atualizar(1, { destino_endereco: 'Y', observacoes: null });
            expect(e).toMatchObject({ origem_endereco: 'velho', destino_endereco: 'Y', peso_kg: 1, observacoes: null });
            expect(e.save).toHaveBeenCalled();
        });
        it('preserva campos não informados', async () => {
            const e = entregaFake({ destino_endereco: 'D', peso_kg: 1, observacoes: 'o' });
            Entrega.findByPk.mockResolvedValue(e);
            await service.atualizar(1, { origem_endereco: 'X' });
            expect(e).toMatchObject({ origem_endereco: 'X', destino_endereco: 'D', peso_kg: 1, observacoes: 'o' });
        });
        it('atualiza todos os campos', async () => {
            const e = entregaFake();
            Entrega.findByPk.mockResolvedValue(e);
            await service.atualizar(1, { origem_endereco: 'X', destino_endereco: 'Y', peso_kg: 2, observacoes: 'o' });
            expect(e).toMatchObject({ origem_endereco: 'X', destino_endereco: 'Y', peso_kg: 2, observacoes: 'o' });
        });
        it('404', async () => {
            Entrega.findByPk.mockResolvedValue(null);
            await expect(service.atualizar(1, {})).rejects.toBeInstanceOf(NaoEncontradoError);
        });
    });

    describe('mudarStatus', () => {
        it('PENDENTE -> ATRIBUIDA em transação, com evento', async () => {
            const e = entregaFake();
            Entrega.findByPk.mockResolvedValue(e);
            await service.mudarStatus(1, 'ATRIBUIDA');
            expect(e.status).toBe('ATRIBUIDA');
            expect(e.save).toHaveBeenCalledWith({ transaction: TX });
            expect(Rastreamento.create).toHaveBeenCalledWith(
                expect.objectContaining({ evento: 'STATUS_ALTERADO', descricao: 'Status alterado de PENDENTE para ATRIBUIDA' }),
                { transaction: TX });
        });
        it('define data_coleta em EM_TRANSITO', async () => {
            const e = entregaFake({ status: 'ATRIBUIDA' });
            Entrega.findByPk.mockResolvedValue(e);
            await service.mudarStatus(1, 'EM_TRANSITO');
            expect(e.data_coleta).toBeInstanceOf(Date);
        });
        it('define data_entrega em ENTREGUE', async () => {
            const e = entregaFake({ status: 'EM_TRANSITO' });
            Entrega.findByPk.mockResolvedValue(e);
            await service.mudarStatus(1, 'ENTREGUE');
            expect(e.data_entrega).toBeInstanceOf(Date);
        });
        it('rejeita transição inválida sem gravar nada', async () => {
            const e = entregaFake({ status: 'ENTREGUE' });
            Entrega.findByPk.mockResolvedValue(e);
            await expect(service.mudarStatus(1, 'PENDENTE')).rejects.toBeInstanceOf(TransicaoInvalidaError);
            expect(e.save).not.toHaveBeenCalled();
            expect(Rastreamento.create).not.toHaveBeenCalled();
        });
        it('404', async () => {
            Entrega.findByPk.mockResolvedValue(null);
            await expect(service.mudarStatus(1, 'ATRIBUIDA')).rejects.toBeInstanceOf(NaoEncontradoError);
        });
        it('propaga falha do rastreamento (a transação desfaz o save)', async () => {
            Entrega.findByPk.mockResolvedValue(entregaFake());
            Rastreamento.create.mockRejectedValue(new Error('falhou'));
            await expect(service.mudarStatus(1, 'ATRIBUIDA')).rejects.toThrow('falhou');
        });
    });

    describe('atribuir', () => {
        const dados = { veiculo_placa: 'ABC1234', motorista_id: 3, motorista_nome: 'Ana', veiculo_modelo: 'Van' };

        it('atribui entrega PENDENTE', async () => {
            const e = entregaFake();
            Entrega.findByPk.mockResolvedValue(e);
            await service.atribuir(1, dados);
            expect(e).toMatchObject({ ...dados, status: 'ATRIBUIDA' });
            expect(Rastreamento.create).toHaveBeenCalledWith(
                expect.objectContaining({ evento: 'ENTREGA_ATRIBUIDA' }), { transaction: TX });
        });
        it('permite reatribuir e zera nome/modelo ausentes', async () => {
            const e = entregaFake({ status: 'ATRIBUIDA' });
            Entrega.findByPk.mockResolvedValue(e);
            await service.atribuir(1, { veiculo_placa: 'ZZZ9999', motorista_id: 4 });
            expect(e).toMatchObject({ motorista_nome: null, veiculo_modelo: null });
        });
        it('rejeita entrega em trânsito (B9)', async () => {
            const e = entregaFake({ status: 'EM_TRANSITO' });
            Entrega.findByPk.mockResolvedValue(e);
            await expect(service.atribuir(1, dados)).rejects.toBeInstanceOf(TransicaoInvalidaError);
            expect(e.save).not.toHaveBeenCalled();
        });
        it('404', async () => {
            Entrega.findByPk.mockResolvedValue(null);
            await expect(service.atribuir(1, dados)).rejects.toBeInstanceOf(NaoEncontradoError);
        });
    });

    describe('cancelar', () => {
        it('cancela e registra evento', async () => {
            const e = entregaFake();
            Entrega.findByPk.mockResolvedValue(e);
            const r = await service.cancelar(1);
            expect(r.status).toBe('CANCELADA');
            expect(Rastreamento.create).toHaveBeenCalledWith(
                expect.objectContaining({ evento: 'ENTREGA_CANCELADA' }), { transaction: TX });
        });
        it('rejeita entrega já entregue (B7)', async () => {
            Entrega.findByPk.mockResolvedValue(entregaFake({ status: 'ENTREGUE' }));
            await expect(service.cancelar(1)).rejects.toBeInstanceOf(TransicaoInvalidaError);
            expect(Rastreamento.create).not.toHaveBeenCalled();
        });
        it('404', async () => {
            Entrega.findByPk.mockResolvedValue(null);
            await expect(service.cancelar(1)).rejects.toBeInstanceOf(NaoEncontradoError);
        });
    });

    describe('estatisticas', () => {
        it('soma os totais por status', async () => {
            Entrega.findAll.mockResolvedValue([
                { status: 'PENDENTE', total: '2' }, { status: 'ENTREGUE', total: '3' }
            ]);
            const r = await service.estatisticas();
            expect(r.total).toBe(5);
            expect(r.por_status).toHaveLength(2);
            expect(new Date(r.gerado_em).toString()).not.toBe('Invalid Date');
            expect(Entrega.findAll.mock.calls[0][0]).toMatchObject({ group: ['status'], raw: true });
        });
        it('total zero sem dados', async () => {
            Entrega.findAll.mockResolvedValue([]);
            expect((await service.estatisticas()).total).toBe(0);
        });
    });
});
