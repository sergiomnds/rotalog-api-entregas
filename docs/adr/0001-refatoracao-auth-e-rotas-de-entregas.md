# ADR 0001 — Refatoração do middleware de autenticação e das rotas de entregas

- **Status:** Parcialmente implementada — **autenticação** (4.1, sem `requireRole`) e **refatoração de `routes/entregas.js`** (4.2, implementada em 2026-11-16) feitas; seguem em aberto `requireRole`/matriz de papéis, rotação de segredos e adaptação de `api-frotas`/frontend
- **Data:** 2026-11-13 (atualizada em 2026-11-16)
- **Implementado em 2026-11-16:**
  - `middleware/auth.js`: bypass removido; verificação real de JWT (`HS256`, `issuer`, `audience`, expiração); `req.user` vem do payload verificado; respostas `401` genéricas, com o motivo só no log.
  - `config/env.js` (novo): `JWT_SECRET` obrigatório, com mínimo de 32 caracteres, sem valor padrão e rejeitando o segredo antigo; `JWT_ISSUER` e `JWT_AUDIENCE` obrigatórios. Validado na inicialização, em `index.js`.
  - `index.js`: `/api/rastreamento` passa a exigir autenticação (corrige A2).
  - `scripts/gerarTokenDev.js` e `npm run token:dev` (novos): token de desenvolvimento, só com `NODE_ENV=development`.
  - Jest configurado, com testes de `auth.js` e `env.js` (35 testes, 100% de cobertura nesses dois arquivos) e limite mínimo de 90%.
  - `.gitignore`: `.env` adicionado (feito manualmente). O arquivo ainda está no índice do git e o segredo antigo continua no histórico (ver seção 7).
- **Rotas implementadas em 2026-11-16 (seção 4.2):** `routes/entregas.js` só com roteamento; `services/entregaService.js` (transações, retry em colisão de `numero_pedido`), `entregaCalculos.js` (Haversine), `numeroPedido.js`, `domain/statusEntrega.js` (transições; `409`), `validators/entregaSchemas.js` + `middleware/validate.js` (zod, `400` com `campos`), `middleware/asyncHandler.js`, `errors/AppError.js`, `config/logger.js` (pino, com redact); `errorHandler` sem `body`/`stack`/`detalhes`; `index.js` usa o logger no log de requisição. Escolhas: zod + pino. Jest + supertest; cobertura de 100% nos arquivos listados em `collectCoverageFrom`. **Não validado contra banco real:** a query de `/stats` (agora Sequelize) e as transações só foram testadas com models mockados; o formato numérico de `distancia_media`/`peso_medio` segue a conferir.
- **Não implementado:** `requireRole`/`authorize` e a matriz de papéis (A1; decisão em aberto, seção 6); logger em `auth.js` (ainda usa `console.warn`/`console.error`) e em `database.js`/`index.js` (demais `console.*`); `git rm --cached .env`, rotação dos segredos e `.env.example`; adaptação de `api-frotas` e do frontend para enviar token.
- **Escopo:** `rotalog-api-entregas` (`src/middleware/auth.js`, `src/routes/entregas.js`, e o ponto de montagem em `src/index.js`)
- **Origem:** `MAPA_DIVIDAS_TECNICAS.md`, seção 2 (itens 2.1, 2.2, 2.3, 2.5) e T1/T2/T3

## 1. Contexto

Dois arquivos concentram a maior parte da dívida do serviço:

- `auth.js` (51 linhas) deveria proteger a API, mas não protege nada.
- `entregas.js` (365 linhas) deveria ser só um arquivo de rotas, mas contém validação, regras de negócio, SQL raw, logs e acesso a dados.

A análise abaixo foi feita por leitura do código (`auth.js`, `entregas.js`, `index.js`, `errorHandler.js`, `package.json`) e cruzada com o mapa de dívidas. **Nada foi executado**: não há testes no projeto, e nenhuma das conclusões foi validada rodando a aplicação.

## 2. Análise de `middleware/auth.js`

### 2.1 Vulnerabilidades

| # | Problema | Onde | Efeito |
|---|---|---|---|
| V1 | **Bypass total fora de produção:** `NODE_ENV !== 'production'` chama `next()` sem checar nada. Isso inclui `NODE_ENV` **não definido**. | L16–19 | Um deploy esquecido sem a variável fica 100% aberto. |
| V2 | **Token nunca é verificado:** só exige formato `Bearer x` com `x.length >= 10`. Sem assinatura, expiração, `iss` ou `aud`. | L28–43 | `Authorization: Bearer aaaaaaaaaa` autentica. |
| V3 | **Identidade fabricada:** qualquer token aceito vira `{ id: 1, nome: 'Admin', role: 'admin' }`. | L46 | Todo chamador é admin; não há como auditar quem fez o quê. |
| V4 | **Segredo com fallback hardcoded** (`'super-secret-key-…'`), e o mesmo valor está no `.env`, que foi versionado (agora no `.gitignore`, mas ainda no índice e no histórico). | L12 | Se a verificação for implementada sem remover o fallback, qualquer um forja tokens válidos. |
| V5 | **`JWT_SECRET` é lido e nunca usado.** `jsonwebtoken` não está no `package.json`. | L12, `package.json` | Dá falsa impressão de que há validação. |
| V6 | **Log do resultado de auth em `console.log`** para toda requisição. | L17, L43 | Ruído e mensagem "Token aceito" enganosa. |

### 2.2 Problemas de arquitetura e responsabilidade

| # | Problema | Observação |
|---|---|---|
| A1 | **Não há autorização.** Nenhuma rota checa `req.user.role`; mesmo que o token fosse real, qualquer usuário autenticado cancelaria qualquer entrega. | Mapa 2.3. |
| A2 | **Rastreamento fica fora do middleware:** `index.js` L76 monta `/api/rastreamento` sem `authMiddleware`, incluindo o `POST`. | Qualquer um grava eventos/posição em qualquer entrega. O próprio `index.js` tem `FIXME` sobre isso. |
| A3 | **O middleware mistura quatro responsabilidades:** decidir ambiente, extrair o header, validar token e montar o usuário. Nada é testável isoladamente. | |
| A4 | **Configuração lida em tempo de importação** com fallback silencioso; não há validação de variáveis de ambiente na inicialização (mapa 2.5). | |
| A5 | **Não existe emissor de token** no ecossistema (mapa T1). O serviço só consegue *verificar* tokens; quem os emite é uma decisão em aberto (ver seção 6). | |
| A6 | **Chamadas entre serviços não carregam credencial** (mapa item 7): `frotas` → `entregas` (`EntregaClient`) e o frontend não enviam `Authorization`. | Ligar autenticação real quebra esses chamadores (ver seção 5). |
| A7 | `var`, `function` e `console.log`, fora do padrão do `node-entregas` (async/await, `const/let`). | |

## 3. Análise de `routes/entregas.js`

### 3.1 O que o arquivo faz além de rotear

| # | Responsabilidade indevida | Onde | Para onde deveria ir |
|---|---|---|---|
| R1 | **SQL raw** com schema hardcoded (`entregas.entregas`) e `sequelize.constructor.QueryTypes` | `/stats` L65–91 | Agregação via Sequelize (`findAll` + `fn('COUNT')`, `group`) em service; schema vem da config do model |
| R2 | **Geração de número de pedido** | POST L153 | Service |
| R3 | **Cálculo de distância e tempo estimado** | POST L156–165 | Função pura em módulo próprio, testável |
| R4 | **Regras de transição de status** e datas de coleta/entrega | PATCH `/status` L245–260 | Service, com tabela de transições |
| R5 | **Orquestração entrega + rastreamento** (4 rotas criam `Rastreamento` à mão, sem transação) | L185, 265, 314, 349 | Service, em transação |
| R6 | **Validação de entrada** inline | L148, 217–218, 246, 296 | Middleware de validação (schema) |
| R7 | **Acesso direto a models** em todos os handlers | todo o arquivo | Service |
| R8 | **Logs com `console.log`/`console.error`** (11 ocorrências) | todo o arquivo | Logger único |
| R9 | **Comentários em excesso:** ~60 linhas de `FIXME`/JSDoc que repetem o que o código diz ou documentam dívida em vez de resolvê-la | todo o arquivo | Removidos; o histórico fica nesta ADR e no mapa |

### 3.2 Bugs encontrados (além dos já listados no mapa)

| # | Bug | Onde | Efeito |
|---|---|---|---|
| B1 | `req.query.status.toUpperCase()` com `?status=a&status=b` (array) lança `TypeError`. | L33 | 500 em vez de 400. *(já no mapa, 2.2)* |
| B2 | `if (origem_lat && origem_lng && …)` trata coordenada `0` como ausente; e `origem_lat \|\| null` grava `null` no lugar de `0`. | L157, 171–174 | Entregas na linha do Equador/meridiano de Greenwich ficam sem distância. *(mapa 2.2)* |
| B3 | Distância é `√(Δlat²+Δlng²)·111`, ignora `cos(lat)`. | L159–161 | Erro cresce com a latitude; ao longo de Δlng em São Paulo, superestima ~10%. |
| B4 | `'PED-' + Date.now() + '-' + random(0–999)` pode colidir sob carga. | L153 | Violação de `UNIQUE` → 500. *(mapa 2.2)* |
| B5 | Strings numéricas passam como coordenada (`"abc"` também): `Math.abs("abc" - 1)` dá `NaN`. | L159–161 | `distancia_km` vira `NaN` e é enviada ao banco. |
| B6 | `PUT` não valida tipo/faixa: `peso_kg` negativo ou string é gravado. | L217 | Dado inválido no banco. |
| B7 | `PATCH /status` aceita `ENTREGUE → PENDENTE` e `DELETE` cancela entrega já `ENTREGUE`. Rastreamento registra a mudança mesmo assim. | L250, 344 | Histórico inconsistente. *(mapa 2.1)* |
| B8 | `PATCH /status` e `/atribuir` gravam a entrega e depois o rastreamento **sem transação**: se o segundo falhar, o status mudou sem evento. | L262–270, 311–319 | Estado e histórico divergem. |
| B9 | `PATCH /atribuir` não verifica se a entrega está em estado atribuível e sobrescreve `status = 'ATRIBUIDA'` mesmo em `EM_TRANSITO`/`ENTREGUE`. | L308 | Regressão de estado. |
| B10 | `POST` devolve `detalhes: error.message` ao cliente. | L198 | Vaza texto interno (mapa 2.3). |
| B11 | `GET /` aceita `?veiculo=` por placa sem normalização; `frotas` chama com a placa como veio. | L27–29 | Divergência de *case* gera resultado vazio. |

### 3.3 Inconsistências de estilo

- Quatro handlers em `.then()` (`/stats`, `/pedido/:n`, `DELETE`) e o resto em `async/await`; o `DELETE` tem três níveis de `.then` aninhados.
- Tratamento de erro desigual (um handler devolve `detalhes`, outros não); nenhum usa o `errorHandler` global, que existe.
- Lista `statusValidos` duplicada na rota e no model/frontend.
- O `errorHandler` global também tem problemas que afetam esta refatoração: loga `req.body` inteiro e devolve `stack` fora de produção (mapa 2.3).

## 4. Decisão

Reorganizar em camadas conforme a convenção do serviço (`routes → services → models`), trocar a autenticação por verificação real de JWT e remover o bypass.

> Esta seção descreve o desenho proposto. **Nenhum protótipo foi feito**; os tamanhos são estimativas.

### 4.1 Autenticação

| Item | Decisão |
|---|---|
| Biblioteca | Adicionar `jsonwebtoken` como dependência. |
| Configuração | Novo `src/config/env.js`: lê e valida `JWT_SECRET`, `JWT_ISSUER`, `JWT_AUDIENCE`, `NODE_ENV`. **Sem valor padrão para o segredo**; o processo falha na inicialização se faltar ou tiver menos de 32 caracteres. |
| Verificação | `jwt.verify(token, secret, { algorithms: ['HS256'], issuer, audience })`. Algoritmo fixado para evitar *algorithm confusion*. Expiração é checada pela biblioteca. |
| Usuário | `req.user = { id: payload.sub, nome, role }` vindo do **payload verificado**. Nada fabricado. |
| Bypass | **Removido.** Em desenvolvimento usa-se um token gerado por script (`npm run token:dev`, que só roda com `NODE_ENV=development`). |
| Autorização | Novo `requireRole(...roles)` em `middleware/authorize.js`. Matriz inicial abaixo. |
| Montagem | `authMiddleware` passa a proteger também `/api/rastreamento` (corrige A2). `GET /api/health` continua público. |
| Erros | `401` (sem token / inválido / expirado), `403` (papel insuficiente), com corpo `{ error }` genérico; o motivo detalhado vai só para o log. |
| Arquivos | `middleware/auth.js` (extrai e verifica), `middleware/authorize.js` (papéis), `config/env.js`. |

**Matriz de papéis proposta** (a confirmar com o negócio — ver seção 6):

| Operação | `admin` | `operador` | `motorista` |
|---|---|---|---|
| Listar / consultar entregas e rastreamento | ✅ | ✅ | ✅ (a restringir às próprias) |
| Criar, editar, atribuir | ✅ | ✅ | ❌ |
| Alterar status | ✅ | ✅ | ✅ (só transições de campo) |
| Cancelar | ✅ | ✅ | ❌ |
| `POST /rastreamento` | ✅ | ✅ | ✅ |

### 4.2 Rotas de entregas

| Arquivo novo | Responsabilidade |
|---|---|
| `routes/entregas.js` | **Só roteamento:** `router.METHOD(path, validate(schema), asyncHandler(handler))`. Sem comentários de dívida, sem `console`, sem model. Estimativa: ~50 linhas. |
| `services/entregaService.js` | Casos de uso: listar, buscar, criar, atualizar, mudar status, atribuir, cancelar, estatísticas. Orquestra entrega + rastreamento **dentro de `sequelize.transaction`**. |
| `services/entregaCalculos.js` | Funções puras: `calcularDistanciaKm` (Haversine), `estimarTempoMinutos`. |
| `services/numeroPedido.js` | Gera `PED-` + data + sufixo aleatório de `crypto.randomUUID()`/`randomBytes`; trata colisão com nova tentativa. |
| `domain/statusEntrega.js` | Constante única `STATUS` e mapa de transições permitidas (abaixo). |
| `middleware/validate.js` + `validators/entregaSchemas.js` | Validação de `body`/`query`/`params` com schema (Joi ou zod — a escolher). Rejeita array em `status`, coordenadas fora de faixa, `peso_kg` negativo. |
| `middleware/asyncHandler.js` | Encaminha rejeições ao `errorHandler`; elimina os `try/catch` repetidos. |
| `errors/AppError.js` | `NaoEncontradoError` (404), `ValidacaoError` (400), `TransicaoInvalidaError` (409), com `status` lido pelo `errorHandler`. |
| `config/logger.js` | Logger estruturado (pino). Substitui todos os `console.*` do arquivo e do `index.js`; faz *redact* de `authorization` e `body`. |

**Transições de status permitidas:**

| De | Para |
|---|---|
| `PENDENTE` | `ATRIBUIDA`, `CANCELADA` |
| `ATRIBUIDA` | `EM_TRANSITO`, `PENDENTE` (desatribuir), `CANCELADA` |
| `EM_TRANSITO` | `ENTREGUE`, `CANCELADA` |
| `ENTREGUE` | — (terminal) |
| `CANCELADA` | — (terminal) |

`/atribuir` só é aceito em `PENDENTE` (e `ATRIBUIDA`, para reatribuir). `DELETE` passa pela mesma tabela.

### 4.3 Ajustes colaterais mínimos

- `errorHandler.js`: remover o log de `req.body`, parar de devolver `stack` e usar o logger. Sem isso, a refatoração das rotas continuaria vazando detalhes.
- `index.js`: validar `env` no boot e trocar o `console.log` do log de requisições pelo logger. **Nada além disso** (CORS, helmet, rate limit, graceful shutdown ficam de fora).

## 5. Mudanças de comportamento previstas

Quem consome a API deve revisar:

| Mudança | Detalhe |
|---|---|
| **Autenticação passa a ser obrigatória em qualquer ambiente** | Hoje, em dev, tudo passa. Frontend (`painel-admin`, `rastreamento`) **não envia token** e **vai receber 401** em todas as chamadas até ser adaptado. |
| **`api-frotas` → `api-entregas` vai receber 401** | `EntregaClient` não envia `Authorization` (mapa, item 7). Hoje o erro é engolido e vira lista vazia. Precisa de um token de serviço. |
| **`/api/rastreamento/*` exige token** | Inclui o `POST`. |
| **`403` novo** | Operações restritas por papel. |
| **Transições inválidas retornam `409`** | `ENTREGUE → PENDENTE`, cancelar entrega entregue, atribuir entrega em trânsito. |
| **Validação retorna `400` com lista de campos** | Coordenadas fora de faixa, `peso_kg` negativo/não numérico, `?status=` repetido. |
| **Coordenada `0` passa a ser aceita** | E gravada como `0`, não `null` (corrige B2). |
| **`distancia_km` e `tempo_estimado_minutos` mudam de valor** | Haversine no lugar da aproximação; `tempo` é derivado dele. Entregas novas terão valores diferentes das antigas para o mesmo trajeto. |
| **Formato de `numero_pedido`** | Mantém prefixo `PED-`; o sufixo muda (UUID/bytes aleatórios). O banco usa `STRING` + `UNIQUE`; **confirmar o tamanho da coluna** antes (ver seção 7). |
| **Respostas de erro** | Sem `detalhes` e sem `stack`; formato único `{ error, campos? }`. |
| **`GET /stats`** | Mesma estrutura de resposta (`total`, `por_status`, `gerado_em`); os números de `distancia_media`/`peso_medio` podem vir como string ou número conforme o driver (a conferir). |

**Mantido de propósito:** CORS `*`, ausência de paginação em `GET /entregas`, `soft delete` por `DELETE`, e a denormalização de `motorista_nome`/`veiculo_modelo` preenchida pelo cliente. Cada um é uma decisão própria.

## 6. Decisões em aberto (precisam de resposta antes de implementar)

1. **Quem emite o JWT?** Não existe emissor no ecossistema. Opções: um serviço de identidade novo, um endpoint de login neste serviço (aumenta o escopo), ou um IdP externo (chave pública/JWKS em vez de HS256). Esta ADR assume **só verificar**, com HS256 e segredo compartilhado, que é a opção mais simples e a pior em segredo compartilhado entre serviços.
2. **Papéis e matriz de permissões** da seção 4.1 são uma proposta; falta validação com o negócio.
3. **Token de serviço** para `api-frotas` → `api-entregas`: claim `role: 'servico'` com escopo de leitura?
4. **Joi ou zod**, e **pino ou winston**: preferência do time. A recomendação é zod + pino, mas nenhum dos dois é requisito.
5. **Existe algum chamador externo** que dependa do `GET /` sem token em dev? O código do repositório só mostra frotas e o frontend.

## 7. Consequências

**Positivas**
- A API deixa de aceitar token qualquer; identidade e papel vêm de um token verificado e auditável.
- `entregas.js` volta a ser só roteamento, e cada regra (transição, distância, número de pedido) fica testável sem Express e sem banco.
- Entrega e rastreamento passam a ser gravados atomicamente.
- Remove 4 bugs reais (B1, B2, B4, B5) e fecha as brechas de transição (B7, B9).

**Negativas / custos**
- **Quebra de compatibilidade imediata** com o frontend e com `api-frotas` (seção 5). Precisam ser ajustados **no mesmo release**, ou a autenticação é ligada atrás de uma flag de rollout (`AUTH_ENFORCED`) por um período curto, o que recria o bypass que esta ADR remove. A recomendação é *não* criar a flag e coordenar o release.
- Nova dependência (`jsonwebtoken`) e mais 2–3 (validação, logger). O mapa já lista 13 vulnerabilidades em dependências; cada nova dependência precisa de `npm audit`.
- Segredo compartilhado (HS256) entre quem emite e quem verifica: rotação exige coordenação.
- ~10 arquivos novos onde hoje há 2.
- **Risco de dados:** o tamanho da coluna `numero_pedido` e os valores existentes de `status` não foram conferidos. Antes de publicar, rodar `SELECT DISTINCT status FROM entregas.entregas;` e conferir o tamanho de `numero_pedido` em `migration.sql`/`models/Entrega.js` (não lidos nesta análise).
- O `.env` contém `JWT_SECRET=super-secret-key-…`. **Remover o fallback do código não invalida esse segredo:** ele precisa ser rotacionado (mapa, Sprint 0, item 1). Isto é pré-requisito para a autenticação valer algo.
  - **Atualização:** `.env` foi adicionado ao `.gitignore`, mas isso só impede que arquivos *novos* sejam rastreados. O `.env` já commitado continua no índice até `git rm --cached .env`, e o segredo antigo continua no histórico do git. Por isso a rotação segue obrigatória; o `.gitignore` não a substitui.
  - Sem o `.env` versionado, quem clonar o repositório não terá `JWT_SECRET`, `JWT_ISSUER` nem `JWT_AUDIENCE`, e o serviço não sobe (falha na inicialização, por desenho). Convém versionar um `.env.example` sem valores secretos.

## 8. Alternativas consideradas

| Alternativa | Por que não |
|---|---|
| Manter o bypass em dev atrás de `AUTH_DISABLED=true` | É a causa de V1: variável esquecida em produção abre tudo. Um token de dev gerado por script custa quase nada. |
| Usar `passport-jwt` | Acrescenta um framework de estratégias para um único esquema; `jsonwebtoken` direto é suficiente. |
| Mover a validação do JWT para um API gateway | Correto no longo prazo (mapa T1/T10), mas não existe gateway e o serviço continuaria sem defesa própria. |
| Dividir `entregas.js` por controller (`controllers/`) além do service | A convenção documentada do serviço é `routes → services → models`; um controller adicional seria só indireção para 8 rotas. |
| Reescrever `entregas.js` para classes | Contraria a convenção (funções em camelCase) sem ganho. |
| Corrigir só o `auth.js` agora, as rotas depois | Possível e menor, mas as rotas é que carregam os bugs B1–B9 e a ausência de transação; e o `403` por papel depende de rotas limpas. Pode ser dividido em dois PRs, na ordem: auth, depois rotas. |

## 9. Plano de implementação sugerido

1. **Pré-requisito:** rotacionar `JWT_SECRET`/senha do banco e retirar `.env` do índice. *(Status: `.env` já está no `.gitignore`; faltam `git rm --cached .env`, a rotação dos segredos e um `.env.example`.)*
2. **Testes de caracterização** (Jest + supertest; hoje `npm test` é placeholder): fixar o comportamento atual das 9 rotas de entregas antes de mexer.
3. `config/env.js`, `config/logger.js`, `errors/AppError.js`, `asyncHandler`, `errorHandler` ajustado.
4. Autenticação real + `authorize`; montar em `/api/rastreamento`; script de token de dev.
5. Extrair `entregaCalculos`, `numeroPedido`, `statusEntrega` (com testes unitários).
6. `entregaService` com transações; `validate` + schemas; reduzir `routes/entregas.js` a roteamento.
7. Ajustar `api-frotas` (`EntregaClient`) e o frontend para enviar token — **mesmo release** de (4).

## 10. Verificação

**Não verificado:** nenhum código foi escrito, compilado ou testado. Em particular, não foram lidos `models/Entrega.js`, `routes/rastreamento.js` nem `migration.sql`; as afirmações sobre tamanho de coluna e sobre o `POST /rastreamento` vêm do mapa de dívidas e de `index.js`. A meta de cobertura a definir na implementação (sugestão: ≥ 90% de linhas e branches em `entregaService`, `entregaCalculos`, `numeroPedido`, `statusEntrega`, `auth` e `authorize`) só pode ser avaliada depois que o Jest for configurado.
