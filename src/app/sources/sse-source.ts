import { ChainEventPayload } from '../models/chain-event.model';
import { ConnectionStatus, SourceAdapter } from '../models/source.model';
import { parsearPayloadEvento } from '../utils/event-parsers';

export class SseSource implements SourceAdapter {
  private stream: EventSource | null = null;
  private readonly handledEventTypes = [
    'chain_snapshot',
    'new_block',
    'mempool_update',
    'mempool_delta',
    'chain_reorg',
    'network_message',
  ];

  constructor(private readonly url: string) {}

  conectar(
    onEvent: (event: ChainEventPayload) => void,
    onStatus: (status: ConnectionStatus, detail: string) => void
  ): void {
    this.stream = new EventSource(this.url);

    this.stream.onopen = () => onStatus('connected', 'sse-conectado');

    const processarMensagem = (message: MessageEvent) => {
      const parsed = parsearPayloadEvento(message.data);
      if (parsed) {
        onEvent(parsed);
      } else {
        onStatus('error', 'sse-json-invalido');
      }
    };

    this.handledEventTypes.forEach((eventType) => {
      this.stream?.addEventListener(eventType, (message) => {
        processarMensagem(message as MessageEvent);
      });
    });

    this.stream.onmessage = (message) => {
      processarMensagem(message);
    };

    this.stream.onerror = () => onStatus('error', 'sse-erro');
  }

  desconectar(): void {
    if (this.stream) {
      this.stream.close();
      this.stream = null;
    }
  }
}
