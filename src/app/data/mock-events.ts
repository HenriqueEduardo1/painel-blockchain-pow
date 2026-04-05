import { BlockData } from '../models/block-data.model';
import { ChainEventPayload } from '../models/chain-event.model';

export function construirEventosMock(): ChainEventPayload[] {
  const genesis: BlockData = {
    index: 0,
    hash: '00000000000000000000000000000000000000000000000000000000genesis',
    previous_hash: '0',
    nonce: 0,
    tx_count: 0,
    miner: 'SYSTEM',
    is_main: true,
  };

  const b1: BlockData = {
    index: 1,
    hash: '00000a11f8f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6f6',
    previous_hash: genesis.hash,
    nonce: 10233,
    tx_count: 3,
    miner: 'node-A',
    is_main: true,
  };

  const b2Main: BlockData = {
    index: 2,
    hash: '00000b22ab11ab11ab11ab11ab11ab11ab11ab11ab11ab11ab11ab11',
    previous_hash: b1.hash,
    nonce: 39810,
    tx_count: 2,
    miner: 'node-C',
    is_main: true,
  };

  const b2Fork: BlockData = {
    index: 2,
    hash: '00000f22cd88cd88cd88cd88cd88cd88cd88cd88cd88cd88cd88cd88',
    previous_hash: b1.hash,
    nonce: 40217,
    tx_count: 4,
    miner: 'node-B',
    is_main: false,
  };

  const b3Main: BlockData = {
    index: 3,
    hash: '00000c33ef44ef44ef44ef44ef44ef44ef44ef44ef44ef44ef44ef44',
    previous_hash: b2Main.hash,
    nonce: 54098,
    tx_count: 3,
    miner: 'node-A',
    is_main: true,
  };

  const b3Fork: BlockData = {
    index: 3,
    hash: '00000f33ac77ac77ac77ac77ac77ac77ac77ac77ac77ac77ac77ac77',
    previous_hash: b2Fork.hash,
    nonce: 54841,
    tx_count: 1,
    miner: 'node-B',
    is_main: false,
  };

  const b4Main: BlockData = {
    index: 4,
    hash: '00000d44123312331233123312331233123312331233123312331233',
    previous_hash: b3Main.hash,
    nonce: 81204,
    tx_count: 2,
    miner: 'node-C',
    is_main: true,
  };

  return [
    {
      type: 'chain_snapshot',
      mempool_size: 5,
      blocks: [genesis, b1, b2Main, b2Fork],
    },
    {
      type: 'new_block',
      block: b3Main,
      mempool_size: 2,
    },
    {
      type: 'new_block',
      block: b3Fork,
      mempool_size: 4,
    },
    {
      type: 'new_block',
      block: b4Main,
      mempool_size: 1,
    },
    {
      type: 'mempool_update',
      size: 6,
    },
  ];
}
