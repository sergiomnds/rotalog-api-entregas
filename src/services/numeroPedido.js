const crypto = require('crypto');

function gerarNumeroPedido(agora = new Date()) {
    const data = agora.toISOString().slice(0, 10).replace(/-/g, '');
    const sufixo = crypto.randomBytes(6).toString('hex').toUpperCase();
    return 'PED-' + data + '-' + sufixo;
}

module.exports = { gerarNumeroPedido };
