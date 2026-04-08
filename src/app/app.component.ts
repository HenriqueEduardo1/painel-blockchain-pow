import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import { DataSet, Edge as VisEdge, Network, Node as VisNode } from 'vis-network/standalone';

import {
  corPorBloco,
  formatarRotuloNo,
  formatarTooltipNo,
  hashCurto,
  obterOpcoesRede,
} from './graph/graph-helpers';
import { BlockData } from './models/block-data.model';
import { ChainEventPayload } from './models/chain-event.model';
import { ConnectionStatus, SourceAdapter, SourceType } from './models/source.model';
import { MockSource } from './sources/mock-source';
import { SseSource } from './sources/sse-source';
import { WebSocketSource } from './sources/websocket-source';
import { parsearDadosBloco } from './utils/event-parsers';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  @ViewChild('networkContainer', { static: true })
  networkContainerRef!: ElementRef<HTMLDivElement>;

  sourceType: SourceType = 'ws';
  endpoint = 'ws://localhost:8000/ws/chain';

  connectionDetail = 'desconectado';
  connectionClass: '' | 'connected' | 'error' = '';
  isConnected = false;

  mainHeight = 0;
  totalBlocks = 0;
  forkBlocks = 0;
  mempoolSize = 0;

  eventLogs: string[] = [];

  private source: SourceAdapter | null = null;
  private network: Network | null = null;

  private readonly graphNodes = new DataSet<VisNode>([]);
  private readonly graphEdges = new DataSet<VisEdge>([]);

  private readonly blocks = new Map<string, BlockData>();
  private readonly edgeIds = new Set<string>();

  ngAfterViewInit(): void {
    this.inicializarRede();
    this.conectarFonte();
  }

  ngOnDestroy(): void {
    this.desconectarFonte();
    this.network?.destroy();
    this.network = null;
  }

  aoMudarTipoFonte(): void {
    if (this.sourceType === 'ws') {
      this.endpoint = 'ws://localhost:8000/ws/chain';
    }

    if (this.sourceType === 'sse') {
      this.endpoint = 'http://localhost:8000/events/chain';
    }
  }

  conectarFonte(): void {
    this.desconectarFonte();

    if (this.sourceType !== 'mock' && this.endpoint.trim().length === 0) {
      this.definirStatusConexao('error', 'endpoint-ausente');
      this.registrarEvento('[ui] endpoint obrigatorio para websocket/sse');
      return;
    }

    if (this.sourceType === 'mock') {
      this.source = new MockSource();
    } else if (this.sourceType === 'ws') {
      this.source = new WebSocketSource(this.endpoint.trim());
    } else {
      this.source = new SseSource(this.endpoint.trim());
    }

    this.isConnected = true;
    this.source.conectar(
      (event) => this.processarEvento(event),
      (status, detail) => this.definirStatusConexao(status, detail)
    );
  }

  desconectarFonte(): void {
    if (this.source) {
      this.source.desconectar();
      this.source = null;
    }

    this.definirStatusConexao('disconnected', 'desconectado');
  }

  private inicializarRede(): void {
    this.network = new Network(
      this.networkContainerRef.nativeElement,
      {
        nodes: this.graphNodes,
        edges: this.graphEdges,
      },
      obterOpcoesRede()
    );
  }

  private definirStatusConexao(status: ConnectionStatus, detail: string): void {
    this.connectionDetail = detail;

    if (status === 'connected') {
      this.connectionClass = 'connected';
      this.isConnected = true;
      return;
    }

    if (status === 'error') {
      this.connectionClass = 'error';
      this.isConnected = false;
      return;
    }

    this.connectionClass = '';
    this.isConnected = false;
  }

  private processarEvento(event: ChainEventPayload): void {
    switch (event.type) {
      case 'chain_snapshot': {
        if (!Array.isArray(event.blocks)) {
          this.registrarEvento('[erro] snapshot invalido');
          return;
        }

        this.consumirSnapshot(event.blocks, event.mempool_size);
        this.registrarEvento(`[snapshot] ${event.blocks.length} blocos carregados`);
        break;
      }

      case 'new_block': {
        const block = parsearDadosBloco(event.block);
        if (!block) {
          this.registrarEvento('[erro] novo bloco invalido');
          return;
        }

        this.consumirBloco(block);

        const mainChainHashes = Array.isArray(event.main_chain_hashes)
          ? event.main_chain_hashes.filter((item): item is string => typeof item === 'string')
          : [];
        if (mainChainHashes.length > 0) {
          this.aplicarReorganizacao(mainChainHashes);
        }

        if (typeof event.mempool_size === 'number') {
          this.mempoolSize = event.mempool_size;
        }

        this.registrarEvento(`[novo_bloco] #${block.index} ${hashCurto(block.hash)}`);
        break;
      }

      case 'mempool_update': {
        if (typeof event.size === 'number') {
          this.mempoolSize = event.size;
          this.registrarEvento(`[atualizacao_mempool] tamanho=${event.size}`);
        }
        break;
      }

      case 'chain_reorg': {
        const hashes = Array.isArray(event.main_chain_hashes)
          ? event.main_chain_hashes.filter((item): item is string => typeof item === 'string')
          : [];

        this.aplicarReorganizacao(hashes);

        const tip = typeof event.new_tip === 'string' ? event.new_tip : '';
        this.registrarEvento(`[reorganizacao] ponta principal ${hashCurto(tip)}`);
        break;
      }

      default:
        this.registrarEvento(`[ignorado] tipo de evento desconhecido ${event.type}`);
    }

    this.atualizarEstilosFork();
    this.atualizarMetricas();
  }

  private consumirSnapshot(rawBlocks: unknown[], mempoolSizeRaw: unknown): void {
    this.graphNodes.clear();
    this.graphEdges.clear();
    this.blocks.clear();
    this.edgeIds.clear();

    if (typeof mempoolSizeRaw === 'number') {
      this.mempoolSize = mempoolSizeRaw;
    }

    rawBlocks.forEach((rawBlock) => {
      const block = parsearDadosBloco(rawBlock);
      if (block) {
        this.consumirBloco(block);
      }
    });
  }

  private consumirBloco(block: BlockData): void {
    this.blocks.set(block.hash, {
      ...block,
      is_main: Boolean(block.is_main),
    });

    this.graphNodes.update({
      id: block.hash,
      label: formatarRotuloNo(block),
      title: formatarTooltipNo(block),
      level: block.index,
      color: corPorBloco(block),
    });

    if (block.previous_hash && block.previous_hash !== '0') {
      const edgeId = `${block.previous_hash}->${block.hash}`;
      if (!this.edgeIds.has(edgeId)) {
        this.edgeIds.add(edgeId);
        this.graphEdges.add({
          id: edgeId,
          from: block.previous_hash,
          to: block.hash,
        });
      }
    }
  }

  private aplicarReorganizacao(mainChainHashes: string[]): void {
    const mainSet = new Set(mainChainHashes);

    this.blocks.forEach((block, hash) => {
      const updated: BlockData = {
        ...block,
        is_main: mainSet.has(hash),
      };

      this.blocks.set(hash, updated);
      this.graphNodes.update({
        id: hash,
        color: corPorBloco(updated),
      });
    });
  }

  private atualizarEstilosFork(): void {
    const childrenCountByParent = new Map<string, number>();

    this.blocks.forEach((block) => {
      if (!block.previous_hash || block.previous_hash === '0') {
        return;
      }

      const count = childrenCountByParent.get(block.previous_hash) ?? 0;
      childrenCountByParent.set(block.previous_hash, count + 1);
    });

    this.blocks.forEach((block, hash) => {
      const isForkPoint = (childrenCountByParent.get(hash) ?? 0) > 1;
      this.graphNodes.update({
        id: hash,
        color: corPorBloco(block, isForkPoint),
        borderWidth: isForkPoint ? 4 : 2,
      });
    });
  }

  private atualizarMetricas(): void {
    let maxHeight = 0;
    let forkCount = 0;

    this.blocks.forEach((block) => {
      if (block.is_main) {
        maxHeight = Math.max(maxHeight, block.index);
      } else {
        forkCount += 1;
      }
    });

    this.mainHeight = maxHeight;
    this.totalBlocks = this.blocks.size;
    this.forkBlocks = forkCount;
  }

  private registrarEvento(message: string): void {
    const stamp = new Date().toLocaleTimeString('pt-BR');
    const logLine = `${stamp} ${message}`;

    this.eventLogs = [logLine, ...this.eventLogs].slice(0, 10);
  }
}
