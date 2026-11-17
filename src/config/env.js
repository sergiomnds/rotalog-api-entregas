const MIN_SECRET_LENGTH = 32;

// Valor que já esteve hardcoded no código e no .env versionado: considerado vazado.
const SEGREDOS_VAZADOS = ['super-secret-key-that-should-not-be-hardcoded'];

function getJwtConfig(env = process.env) {
    const { JWT_SECRET: secret, JWT_ISSUER: issuer, JWT_AUDIENCE: audience } = env;
    const erros = [];

    if (!secret) {
        erros.push('JWT_SECRET é obrigatório');
    } else if (secret.length < MIN_SECRET_LENGTH) {
        erros.push(`JWT_SECRET deve ter pelo menos ${MIN_SECRET_LENGTH} caracteres`);
    } else if (SEGREDOS_VAZADOS.some((vazado) => secret.includes(vazado))) {
        erros.push('JWT_SECRET usa um valor que já foi exposto no repositório; gere um novo');
    }
    if (!issuer) erros.push('JWT_ISSUER é obrigatório');
    if (!audience) erros.push('JWT_AUDIENCE é obrigatório');

    if (erros.length > 0) {
        throw new Error('Configuração de autenticação inválida: ' + erros.join('; '));
    }

    return { secret, issuer, audience };
}

module.exports = { getJwtConfig, MIN_SECRET_LENGTH };
