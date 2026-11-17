const { fn, col } = require('sequelize');
const { Entrega, Rastreamento } = require('../models');
const { sequelize } = require('../config/database');
const logger = require('../config/logger');
const { NaoEncontradoError, TransicaoInvalidaError } = require('../errors/AppError');
const { STATUS, podeTransitar, podeAtribuir } = require('../domain/statusEntrega');
const { calcularDistanciaKm, estimarTempoMinutos } = require('./entregaCalculos');
const { gerarNumeroPedido } = require('./numeroPedido');

const MAX_TENTATIVAS_NUMERO_PEDIDO = 3;
const LIMITE_RASTREAMENTOS_LISTAGEM = 5;

function temValor(v) {
    return v !== null && v !== undefined;
}

function valorOuNull(v) {
    return temValor(v) ? v : null;
}

function registrarEvento(entregaId, evento, descricao, transaction) {
    return Rastreamento.create(
        { entrega_id: entregaId, evento, descricao, data_evento: new Date() },
        { transaction }
    );
}

async function carregarOuFalhar(id, transaction) {
    const entrega = await Entrega.findByPk(id, { transaction });
    if (!entrega) throw new NaoEncontradoError('Entrega não encontrada');
    return entrega;
}

async function listar(filtros = {}) {
    const where = {};
    if (filtros.veiculo) where.veiculo_placa = filtros.veiculo;
    if (filtros.status) where.status = filtros.status;
    if (filtros.motorista_id) where.motorista_id = filtros.motorista_id;

    return Entrega.findAll({
        where,
        order: [['data_criacao', 'DESC']],
        include: [{
            model: Rastreamento,
            as: 'rastreamentos',
            limit: LIMITE_RASTREAMENTOS_LISTAGEM,
            order: [['data_evento', 'DESC']]
        }]
    });
}

async function buscarPorId(id) {
    const entrega = await Entrega.findByPk(id, {
        include: [{ model: Rastreamento, as: 'rastreamentos', order: [['data_evento', 'DESC']] }]
    });
    if (!entrega) throw new NaoEncontradoError('Entrega não encontrada');
    return entrega;
}

async function buscarPorPedido(numeroPedido) {
    const entrega = await Entrega.findOne({ where: { numero_pedido: numeroPedido } });
    if (!entrega) throw new NaoEncontradoError('Pedido não encontrado');
    return entrega;
}

function calcularRota(dados) {
    const { origem_lat, origem_lng, destino_lat, destino_lng } = dados;
    if (![origem_lat, origem_lng, destino_lat, destino_lng].every(temValor)) {
        return { distanciaKm: null, tempoEstimado: null };
    }
    const distanciaKm = calcularDistanciaKm(
        { lat: origem_lat, lng: origem_lng },
        { lat: destino_lat, lng: destino_lng }
    );
    return { distanciaKm, tempoEstimado: estimarTempoMinutos(distanciaKm) };
}

function ehColisao(error) {
    return Boolean(error) && error.name === 'SequelizeUniqueConstraintError';
}

async function criar(dados) {
    const { distanciaKm, tempoEstimado } = calcularRota(dados);
    const agora = new Date();

    for (let tentativa = 1; ; tentativa++) {
        const numeroPedido = gerarNumeroPedido(agora);
        try {
            const entrega = await sequelize.transaction(async (transaction) => {
                const criada = await Entrega.create({
                    numero_pedido: numeroPedido,
                    origem_endereco: dados.origem_endereco,
                    destino_endereco: dados.destino_endereco,
                    origem_lat: valorOuNull(dados.origem_lat),
                    origem_lng: valorOuNull(dados.origem_lng),
                    destino_lat: valorOuNull(dados.destino_lat),
                    destino_lng: valorOuNull(dados.destino_lng),
                    peso_kg: valorOuNull(dados.peso_kg),
                    distancia_km: distanciaKm,
                    tempo_estimado_minutos: tempoEstimado,
                    status: STATUS.PENDENTE,
                    observacoes: dados.observacoes || null,
                    data_criacao: agora,
                    data_atualizacao: agora
                }, { transaction });

                await registrarEvento(criada.id, 'PEDIDO_CRIADO', 'Pedido de entrega criado: ' + numeroPedido, transaction);
                return criada;
            });
            logger.info({ numeroPedido }, 'Entrega criada');
            return entrega;
        } catch (error) {
            if (ehColisao(error) && tentativa < MAX_TENTATIVAS_NUMERO_PEDIDO) {
                logger.warn({ numeroPedido, tentativa }, 'Colisão de número de pedido, tentando novamente');
                continue;
            }
            throw error;
        }
    }
}

async function atualizar(id, dados) {
    const entrega = await carregarOuFalhar(id);

    if (dados.origem_endereco !== undefined) entrega.origem_endereco = dados.origem_endereco;
    if (dados.destino_endereco !== undefined) entrega.destino_endereco = dados.destino_endereco;
    if (dados.peso_kg !== undefined) entrega.peso_kg = dados.peso_kg;
    if (dados.observacoes !== undefined) entrega.observacoes = dados.observacoes;
    entrega.data_atualizacao = new Date();

    await entrega.save();
    return entrega;
}

async function mudarStatus(id, novoStatus) {
    return sequelize.transaction(async (transaction) => {
        const entrega = await carregarOuFalhar(id, transaction);
        const statusAnterior = entrega.status;

        if (!podeTransitar(statusAnterior, novoStatus)) {
            throw new TransicaoInvalidaError('Transição de ' + statusAnterior + ' para ' + novoStatus + ' não permitida');
        }

        const agora = new Date();
        entrega.status = novoStatus;
        entrega.data_atualizacao = agora;
        if (novoStatus === STATUS.EM_TRANSITO) entrega.data_coleta = agora;
        if (novoStatus === STATUS.ENTREGUE) entrega.data_entrega = agora;

        await entrega.save({ transaction });
        await registrarEvento(
            entrega.id,
            'STATUS_ALTERADO',
            'Status alterado de ' + statusAnterior + ' para ' + novoStatus,
            transaction
        );

        logger.info({ numeroPedido: entrega.numero_pedido, de: statusAnterior, para: novoStatus }, 'Status atualizado');
        return entrega;
    });
}

async function atribuir(id, dados) {
    return sequelize.transaction(async (transaction) => {
        const entrega = await carregarOuFalhar(id, transaction);

        if (!podeAtribuir(entrega.status)) {
            throw new TransicaoInvalidaError('Entrega com status ' + entrega.status + ' não pode ser atribuída');
        }

        entrega.veiculo_placa = dados.veiculo_placa;
        entrega.motorista_id = dados.motorista_id;
        entrega.motorista_nome = dados.motorista_nome || null;
        entrega.veiculo_modelo = dados.veiculo_modelo || null;
        entrega.status = STATUS.ATRIBUIDA;
        entrega.data_atualizacao = new Date();

        await entrega.save({ transaction });
        await registrarEvento(
            entrega.id,
            'ENTREGA_ATRIBUIDA',
            'Atribuída ao veículo ' + dados.veiculo_placa + ' e motorista #' + dados.motorista_id,
            transaction
        );

        logger.info({ numeroPedido: entrega.numero_pedido, veiculo: dados.veiculo_placa }, 'Entrega atribuída');
        return entrega;
    });
}

async function cancelar(id) {
    return sequelize.transaction(async (transaction) => {
        const entrega = await carregarOuFalhar(id, transaction);

        if (!podeTransitar(entrega.status, STATUS.CANCELADA)) {
            throw new TransicaoInvalidaError('Entrega com status ' + entrega.status + ' não pode ser cancelada');
        }

        entrega.status = STATUS.CANCELADA;
        entrega.data_atualizacao = new Date();

        await entrega.save({ transaction });
        await registrarEvento(entrega.id, 'ENTREGA_CANCELADA', 'Entrega cancelada', transaction);

        logger.info({ numeroPedido: entrega.numero_pedido }, 'Entrega cancelada');
        return entrega;
    });
}

async function estatisticas() {
    const linhas = await Entrega.findAll({
        attributes: [
            'status',
            [fn('COUNT', col('id')), 'total'],
            [fn('COALESCE', fn('AVG', col('distancia_km')), 0), 'distancia_media'],
            [fn('COALESCE', fn('AVG', col('peso_kg')), 0), 'peso_medio']
        ],
        group: ['status'],
        raw: true
    });

    return {
        total: linhas.reduce((acc, l) => acc + parseInt(l.total, 10), 0),
        por_status: linhas,
        gerado_em: new Date().toISOString()
    };
}

module.exports = {
    listar,
    buscarPorId,
    buscarPorPedido,
    criar,
    atualizar,
    mudarStatus,
    atribuir,
    cancelar,
    estatisticas
};
