import { ChainEventPayload } from '../models/chain-event.model';
import { ConnectionStatus, SourceAdapter } from '../models/source.model';
import { parsearPayloadEvento } from '../utils/event-parsers';

export class SseSource implements SourceAdapter {
  private stream: EventSource | null = null;

  constructor(private readonly url: string) {}

  conectar(
    onEvent: (event: ChainEventPayload) => void,
    onStatus: (status: ConnectionStatus, detail: string) => void
  ): void {
    this.stream = new EventSource(this.url);

    this.stream.onopen = () => onStatus('connected', 'sse-conectado');

    this.stream.onmessage = (message) => {
      const parsed = parsearPayloadEvento(message.data);
      if (parsed) {
        onEvent(parsed);
      } else {
        onStatus('error', 'sse-json-invalido');
      }
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
