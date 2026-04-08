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
  private readonly childrenCountByParent = new Map<string, number>();

  private forkPointHashes = new Set<string>();
  private mainChainHashes = new Set<string>();

  private mainBlockCount = 0;

  private readonly performanceModeThreshold = 300;
  private performanceModeEnabled = false;

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
  }

  private consumirSnapshot(rawBlocks: unknown[], mempoolSizeRaw: unknown): void {
    this.graphNodes.clear();
    this.graphEdges.clear();
    this.blocks.clear();
    this.edgeIds.clear();
    this.childrenCountByParent.clear();

    this.forkPointHashes = new Set<string>();
    this.mainChainHashes = new Set<string>();
    this.mainBlockCount = 0;

    this.mainHeight = 0;
    this.totalBlocks = 0;
    this.forkBlocks = 0;

    if (typeof mempoolSizeRaw === 'number') {
      this.mempoolSize = mempoolSizeRaw;
    }

    rawBlocks.forEach((rawBlock) => {
      const block = parsearDadosBloco(rawBlock);
      if (block) {
        this.consumirBloco(block, false);
      }
    });

    this.atualizarMetricasDerivadas();
    this.atualizarModoPerformance();
  }

  private consumirBloco(block: BlockData, atualizarUi = true): boolean {
    const isMain = this.mainChainHashes.has(block.hash) || Boolean(block.is_main);
    const normalizedBlock: BlockData = {
      ...block,
      is_main: isMain,
    };

    if (this.blocks.has(normalizedBlock.hash)) {
      return false;
    }

    this.blocks.set(normalizedBlock.hash, normalizedBlock);

    if (normalizedBlock.is_main) {
      this.mainChainHashes.add(normalizedBlock.hash);
      this.mainBlockCount += 1;
      this.mainHeight = Math.max(this.mainHeight, normalizedBlock.index);
    }

    const isForkPoint = this.forkPointHashes.has(normalizedBlock.hash);

    this.graphNodes.add({
      id: normalizedBlock.hash,
      label: formatarRotuloNo(normalizedBlock),
      title: formatarTooltipNo(normalizedBlock),
      level: normalizedBlock.index,
      color: corPorBloco(normalizedBlock, isForkPoint),
      borderWidth: isForkPoint ? 4 : 2,
    });

    if (normalizedBlock.previous_hash && normalizedBlock.previous_hash !== '0') {
      const edgeId = `${normalizedBlock.previous_hash}->${normalizedBlock.hash}`;
      if (!this.edgeIds.has(edgeId)) {
        this.edgeIds.add(edgeId);
        this.graphEdges.add({
          id: edgeId,
          from: normalizedBlock.previous_hash,
          to: normalizedBlock.hash,
        });
      }

      const childCount = (this.childrenCountByParent.get(normalizedBlock.previous_hash) ?? 0) + 1;
      this.childrenCountByParent.set(normalizedBlock.previous_hash, childCount);

      if (childCount === 2) {
        this.forkPointHashes.add(normalizedBlock.previous_hash);
        const parentBlock = this.blocks.get(normalizedBlock.previous_hash);
        if (parentBlock) {
          this.graphNodes.update({
            id: normalizedBlock.previous_hash,
            color: corPorBloco(parentBlock, true),
            borderWidth: 4,
          });
        }
      }
    }

    if (atualizarUi) {
      this.atualizarMetricasDerivadas();
      this.atualizarModoPerformance();
    }

    return true;
  }

  private aplicarReorganizacao(mainChainHashes: string[]): void {
    const nextMainSet = new Set(mainChainHashes);
    const nodeUpdates: VisNode[] = [];
    let requiresMainHeightRecalc = false;

    this.mainChainHashes.forEach((hash) => {
      if (nextMainSet.has(hash)) {
        return;
      }

      const block = this.blocks.get(hash);
      if (!block || !block.is_main) {
        return;
      }

      const updatedBlock: BlockData = {
        ...block,
        is_main: false,
      };

      this.blocks.set(hash, updatedBlock);
      this.mainBlockCount = Math.max(0, this.mainBlockCount - 1);
      if (updatedBlock.index >= this.mainHeight) {
        requiresMainHeightRecalc = true;
      }

      nodeUpdates.push({
        id: hash,
        color: corPorBloco(updatedBlock, this.forkPointHashes.has(hash)),
        borderWidth: this.forkPointHashes.has(hash) ? 4 : 2,
      });
    });

    nextMainSet.forEach((hash) => {
      if (this.mainChainHashes.has(hash)) {
        return;
      }

      const block = this.blocks.get(hash);
      if (!block || block.is_main) {
        return;
      }

      const updatedBlock: BlockData = {
        ...block,
        is_main: true,
      };

      this.blocks.set(hash, updatedBlock);
      this.mainBlockCount += 1;
      this.mainHeight = Math.max(this.mainHeight, updatedBlock.index);

      nodeUpdates.push({
        id: hash,
        color: corPorBloco(updatedBlock, this.forkPointHashes.has(hash)),
        borderWidth: this.forkPointHashes.has(hash) ? 4 : 2,
      });
    });

    this.mainChainHashes = nextMainSet;

    if (requiresMainHeightRecalc) {
      this.mainHeight = this.calcularAlturaMainChain();
    }

    if (nodeUpdates.length > 0) {
      this.graphNodes.update(nodeUpdates);
    }

    this.atualizarMetricasDerivadas();
  }

  private calcularAlturaMainChain(): number {
    let nextMainHeight = 0;

    this.mainChainHashes.forEach((hash) => {
      const block = this.blocks.get(hash);
      if (block?.is_main) {
        nextMainHeight = Math.max(nextMainHeight, block.index);
      }
    });

    return nextMainHeight;
  }

  private atualizarMetricasDerivadas(): void {
    this.totalBlocks = this.blocks.size;
    this.forkBlocks = Math.max(0, this.totalBlocks - this.mainBlockCount);
  }

  private atualizarModoPerformance(): void {
    if (!this.network) {
      return;
    }

    const shouldEnablePerformanceMode = this.blocks.size >= this.performanceModeThreshold;

    if (shouldEnablePerformanceMode === this.performanceModeEnabled) {
      return;
    }

    this.performanceModeEnabled = shouldEnablePerformanceMode;

    this.network.setOptions({
      interaction: {
        hover: !shouldEnablePerformanceMode,
        dragNodes: false,
        zoomView: true,
      },
      edges: shouldEnablePerformanceMode
        ? {
            smooth: false,
          }
        : {
            smooth: {
              enabled: true,
              type: 'cubicBezier',
              forceDirection: 'vertical',
              roundness: 0.2,
            },
          },
    });
  }

  private registrarEvento(message: string): void {
    const stamp = new Date().toLocaleTimeString('pt-BR');
    const logLine = `${stamp} ${message}`;

    this.eventLogs = [logLine, ...this.eventLogs].slice(0, 10);
  }
}
