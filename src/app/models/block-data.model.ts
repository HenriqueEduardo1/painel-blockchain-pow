export interface BlockData {
  index: number;
  hash: string;
  previous_hash: string;
  nonce?: number;
  tx_count?: number;
  miner?: string;
  is_main?: boolean;
}
