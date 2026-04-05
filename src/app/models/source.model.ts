import { ChainEventPayload } from './chain-event.model';

export type SourceType = 'mock' | 'ws' | 'sse';
export type ConnectionStatus = 'connected' | 'disconnected' | 'error';

export interface SourceAdapter {
  conectar(
    onEvent: (event: ChainEventPayload) => void,
    onStatus: (status: ConnectionStatus, detail: string) => void
  ): void;

  desconectar(): void;
}
