const STATUS = Object.freeze({
    PENDENTE: 'PENDENTE',
    ATRIBUIDA: 'ATRIBUIDA',
    EM_TRANSITO: 'EM_TRANSITO',
    ENTREGUE: 'ENTREGUE',
    CANCELADA: 'CANCELADA'
});

const STATUS_VALIDOS = Object.freeze(Object.values(STATUS));

const TRANSICOES = Object.freeze({
    [STATUS.PENDENTE]: [STATUS.ATRIBUIDA, STATUS.CANCELADA],
    [STATUS.ATRIBUIDA]: [STATUS.EM_TRANSITO, STATUS.PENDENTE, STATUS.CANCELADA],
    [STATUS.EM_TRANSITO]: [STATUS.ENTREGUE, STATUS.CANCELADA],
    [STATUS.ENTREGUE]: [],
    [STATUS.CANCELADA]: []
});

const STATUS_ATRIBUIVEIS = Object.freeze([STATUS.PENDENTE, STATUS.ATRIBUIDA]);

function podeTransitar(de, para) {
    return (TRANSICOES[de] || []).includes(para);
}

function podeAtribuir(status) {
    return STATUS_ATRIBUIVEIS.includes(status);
}

module.exports = { STATUS, STATUS_VALIDOS, TRANSICOES, podeTransitar, podeAtribuir };
