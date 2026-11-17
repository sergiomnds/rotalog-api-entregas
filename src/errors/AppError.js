class AppError extends Error {
    constructor(message, status = 500) {
        super(message);
        this.name = this.constructor.name;
        this.status = status;
        this.expose = status < 500;
    }
}

class NaoEncontradoError extends AppError {
    constructor(message = 'Recurso não encontrado') {
        super(message, 404);
    }
}

class ValidacaoError extends AppError {
    constructor(campos = [], message = 'Dados inválidos') {
        super(message, 400);
        this.campos = campos;
    }
}

class TransicaoInvalidaError extends AppError {
    constructor(message = 'Transição de status inválida') {
        super(message, 409);
    }
}

module.exports = { AppError, NaoEncontradoError, ValidacaoError, TransicaoInvalidaError };
