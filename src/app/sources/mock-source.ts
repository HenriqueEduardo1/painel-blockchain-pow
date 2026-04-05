import { construirEventosMock } from '../data/mock-events';
import { ChainEventPayload } from '../models/chain-event.model';
import { ConnectionStatus, SourceAdapter } from '../models/source.model';

export class MockSource implements SourceAdapter {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private step = 0;

  constructor(private readonly events: ChainEventPayload[] = construirEventosMock()) {}

  conectar(
    onEvent: (event: ChainEventPayload) => void,
    onStatus: (status: ConnectionStatus, detail: string) => void
  ): void {
    onStatus('connected', 'fluxo-simulado');

    if (this.events.length === 0) {
      return;
    }

    onEvent(this.events[0]);

    this.intervalId = setInterval(() => {
      this.step += 1;
      onEvent(this.events[this.step % this.events.length]);
    }, 2600);
  }

  desconectar(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }
}
