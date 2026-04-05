import { BlockData } from '../models/block-data.model';
import { ChainEventPayload } from '../models/chain-event.model';

export function parsearPayloadEvento(raw: unknown): ChainEventPayload | null {
  let candidate: unknown = raw;

  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }

  if (!candidate || typeof candidate !== 'object') {
    return null;
  }

  const asRecord = candidate as Record<string, unknown>;
  const eventType = asRecord['type'];

  if (typeof eventType !== 'string') {
    return null;
  }

  return {
    type: eventType,
    blocks: asRecord['blocks'],
    block: asRecord['block'],
    mempool_size: asRecord['mempool_size'],
    size: asRecord['size'],
    main_chain_hashes: asRecord['main_chain_hashes'],
    new_tip: asRecord['new_tip'],
  };
}

export function parsearDadosBloco(rawBlock: unknown): BlockData | null {
  if (!rawBlock || typeof rawBlock !== 'object') {
    return null;
  }

  const block = rawBlock as Record<string, unknown>;

  const hash = block['hash'];
  const previousHash = block['previous_hash'];
  const index = block['index'];

  if (
    typeof hash !== 'string' ||
    typeof previousHash !== 'string' ||
    typeof index !== 'number'
  ) {
    return null;
  }

  const nonce = block['nonce'];
  const txCount = block['tx_count'];
  const miner = block['miner'];
  const isMain = block['is_main'];

  return {
    index,
    hash,
    previous_hash: previousHash,
    nonce: typeof nonce === 'number' ? nonce : 0,
    tx_count: typeof txCount === 'number' ? txCount : 0,
    miner: typeof miner === 'string' ? miner : undefined,
    is_main: typeof isMain === 'boolean' ? isMain : false,
  };
}
