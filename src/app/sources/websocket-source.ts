import { ChainEventPayload } from '../models/chain-event.model';
import { ConnectionStatus, SourceAdapter } from '../models/source.model';
import { parsearPayloadEvento } from '../utils/event-parsers';

export class WebSocketSource implements SourceAdapter {
  private socket: WebSocket | null = null;

  constructor(private readonly url: string) {}

  conectar(
    onEvent: (event: ChainEventPayload) => void,
    onStatus: (status: ConnectionStatus, detail: string) => void
  ): void {
    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => onStatus('connected', 'ws-conectado');

    this.socket.onmessage = (message) => {
      const parsed = parsearPayloadEvento(message.data);
      if (parsed) {
        onEvent(parsed);
      } else {
        onStatus('error', 'ws-json-invalido');
      }
    };

    this.socket.onerror = () => onStatus('error', 'ws-erro');
    this.socket.onclose = () => onStatus('disconnected', 'ws-fechado');
  }

  desconectar(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
