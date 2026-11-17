const { z } = require('zod');
const { STATUS_VALIDOS } = require('../domain/statusEntrega');

const idPositivo = z.coerce.number().int().positive();
const texto = (max) => z.string().trim().min(1).max(max);
const latitude = z.number().min(-90).max(90);
const longitude = z.number().min(-180).max(180);
const status = z.enum(STATUS_VALIDOS);
const placa = z.string().trim().min(1).max(7).transform((v) => v.toUpperCase());

const idParams = z.object({ id: idPositivo });

const pedidoParams = z.object({ numeroPedido: texto(50) });

const listarQuery = z.object({
    veiculo: placa.optional(),
    status: z.string().trim().toUpperCase().pipe(status).optional(),
    motorista_id: idPositivo.optional()
});

const criarBody = z.object({
    origem_endereco: texto(255),
    destino_endereco: texto(255),
    origem_lat: latitude.nullish(),
    origem_lng: longitude.nullish(),
    destino_lat: latitude.nullish(),
    destino_lng: longitude.nullish(),
    peso_kg: z.number().positive().nullish(),
    observacoes: z.string().nullish()
});

const atualizarBody = z.object({
    origem_endereco: texto(255).optional(),
    destino_endereco: texto(255).optional(),
    peso_kg: z.number().positive().nullable().optional(),
    observacoes: z.string().nullable().optional()
});

const statusBody = z.object({ status });

const atribuirBody = z.object({
    veiculo_placa: placa,
    motorista_id: idPositivo,
    motorista_nome: texto(100).nullish(),
    veiculo_modelo: texto(100).nullish()
});

module.exports = {
    idParams,
    pedidoParams,
    listarQuery,
    criarBody,
    atualizarBody,
    statusBody,
    atribuirBody
};
