# painel-blockchain-pow

Projeto Angular para visualizacao em tempo real da blockchain PoW, incluindo cadeia principal, forks, metrica de mempool e stream de eventos.

## Requisitos

- Node 16.14+ (recomendado 18+)
- npm 8+

## Como executar

```bash
cd painel-blockchain-pow
npm install
npm start
```

Abra em:

- http://localhost:4200

## Fontes de eventos suportadas

- Fluxo simulado (mock)
- WebSocket (ex: `api/ws/chain`)
- SSE (ex: `api/events/chain`)

## Contrato de eventos esperado

Cada mensagem deve ter o campo `type` e seguir um destes formatos:

### Snapshot completo

```json
{
  "type": "chain_snapshot",
  "mempool_size": 5,
  "blocks": [
    {
      "index": 2,
      "hash": "00000abc...",
      "previous_hash": "00000def...",
      "nonce": 1234,
      "tx_count": 3,
      "miner": "node-A",
      "is_main": true
    }
  ]
}
```

### Novo bloco

```json
{
  "type": "new_block",
  "mempool_size": 4,
  "block": {
    "index": 3,
    "hash": "00000bbb...",
    "previous_hash": "00000abc...",
    "nonce": 9991,
    "tx_count": 2,
    "miner": "node-B",
    "is_main": false
  }
}
```

### Atualizacao da mempool

```json
{
  "type": "mempool_update",
  "size": 12
}
```

### Reorganizacao de cadeia (opcional)

```json
{
  "type": "chain_reorg",
  "new_tip": "00000ccc...",
  "main_chain_hashes": ["hash0", "hash1", "hash2", "hash3"]
}
```
