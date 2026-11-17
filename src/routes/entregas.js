const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const validate = require('../middleware/validate');
const service = require('../services/entregaService');
const schemas = require('../validators/entregaSchemas');

const router = express.Router();

router.get('/', validate({ query: schemas.listarQuery }),
    asyncHandler(async (req, res) => res.json(await service.listar(req.query))));

router.get('/stats',
    asyncHandler(async (req, res) => res.json(await service.estatisticas())));

router.get('/pedido/:numeroPedido', validate({ params: schemas.pedidoParams }),
    asyncHandler(async (req, res) => res.json(await service.buscarPorPedido(req.params.numeroPedido))));

router.get('/:id', validate({ params: schemas.idParams }),
    asyncHandler(async (req, res) => res.json(await service.buscarPorId(req.params.id))));

router.post('/', validate({ body: schemas.criarBody }),
    asyncHandler(async (req, res) => res.status(201).json(await service.criar(req.body))));

router.put('/:id', validate({ params: schemas.idParams, body: schemas.atualizarBody }),
    asyncHandler(async (req, res) => res.json(await service.atualizar(req.params.id, req.body))));

router.patch('/:id/status', validate({ params: schemas.idParams, body: schemas.statusBody }),
    asyncHandler(async (req, res) => res.json(await service.mudarStatus(req.params.id, req.body.status))));

router.patch('/:id/atribuir', validate({ params: schemas.idParams, body: schemas.atribuirBody }),
    asyncHandler(async (req, res) => res.json(await service.atribuir(req.params.id, req.body))));

router.delete('/:id', validate({ params: schemas.idParams }),
    asyncHandler(async (req, res) => {
        const entrega = await service.cancelar(req.params.id);
        res.json({ message: 'Entrega cancelada', entrega });
    }));

module.exports = router;
