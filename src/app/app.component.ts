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
import { IpfsService } from './services/ipfs.service';
import { HttpClient } from '@angular/common/http';
import { CryptoService } from './services/crypto.service';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
})
export class AppComponent implements AfterViewInit, OnDestroy {
  selectedFile: File | null = null;
  receiverPublicKey: string = '';
  
  // O Angular injeta os serviços automaticamente aqui no construtor (Injeção de Dependência)
  constructor(
    private ipfsService: IpfsService,
    private cryptoService: CryptoService,
    private http: HttpClient
  ) {}
  
  onFileSelected(event: any) {
    this.selectedFile = event.target.files[0];
  }
  
  
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
    // this.graphNodes.clear();
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

  async enviarTransacao() {
    if (!this.selectedFile || !this.receiverPublicKey) return;

    try {
      console.log('1. Gerando chave AES descartável...');
      const aesKey = await this.cryptoService.generateAESKey();

      console.log('2. Criptografando o arquivo com AES...');
      const { encryptedBlob, iv } = await this.cryptoService.encryptFile(this.selectedFile, aesKey);

      // Vamos converter o IV para base64 para enviá-lo junto com a transação
      const ivBase64 = this.cryptoService.arrayBufferToBase64(iv);
      
      // Opcional: Você pode querer criar um novo arquivo para o IPFS contendo a extensão original ou metadados
      const encryptedFile = new File([encryptedBlob], `${this.selectedFile.name}.enc`);

      console.log('3. Subindo arquivo criptografado para o IPFS...');
      const fileUri = await this.ipfsService.uploadFile(encryptedFile, encryptedFile.name);
      console.log('Arquivo salvo no IPFS! URI:', fileUri);

      console.log('4. Criptografando a chave AES com a Pública do Destinatário...');
      const rsaPublicKey = await this.cryptoService.importPublicKey(this.receiverPublicKey);
      const encryptedAccessKeyBase64 = await this.cryptoService.encryptAESKeyWithRSA(aesKey, rsaPublicKey);

      console.log('5. Montando a Transação...');
      const transaction = {
        sender: 'SUA_CHAVE_PUBLICA_AQUI', 
        receiver: this.receiverPublicKey,
        file_uri: fileUri,
        encrypted_key: encryptedAccessKeyBase64, // A chave AES trancada
        aes_iv: ivBase64, // O IV necessário para abrir o arquivo
        fee: 1.5,
        timestamp: Date.now()
      };

      console.log('6. Disparando para o Gateway (Kafka)!', transaction);
      
      // Fazendo o POST para a rota que sugerimos criar no seu Python FastAPI
      const httpEndpoint = this.endpoint.replace('ws://', 'http://').replace('/ws/chain', '/transactions');
      await this.http.post(httpEndpoint, transaction).toPromise();
      
      alert('Transação enviada e arquivo seguro na rede!');

    } catch (error) {
      console.error('Falha no processo:', error);
      alert('Erro ao enviar o arquivo. Verifique se a chave pública está no formato correto.');
    }
  }
  // ==========================================
  
  // O destinatário cola sua chave privada aqui (em um cenário real, isso viria de uma carteira local segura, nunca exposta no HTML diretamente)
  minhaChavePrivada: string = '';
  transacaoJsonPasted: string = '';

  /**
   * Simula o clique em um botão "Baixar e Descriptografar Arquivo"
   * @param transacaoRecebida O objeto JSON que chegou do Gateway Kafka
   */
  async baixarEDescriptografarArquivo(transacaoRecebida: any) {
    if (!this.minhaChavePrivada) {
      alert('Sua chave privada é necessária para abrir este arquivo.');
      return;
    }

    try {
      console.log('1. Importando sua Chave Privada RSA...');
      const rsaPrivateKey = await this.cryptoService.importPrivateKey(this.minhaChavePrivada);

      console.log('2. Recuperando a Chave AES descartável da transação...');
      // encrypted_key é a chave AES trancada que veio na transação
      const aesKey = await this.cryptoService.decryptAESKeyWithRSA(
        transacaoRecebida.encrypted_key, 
        rsaPrivateKey
      );

      console.log('3. Baixando o arquivo criptografado do IPFS...');
      // Aqui você faz a requisição GET para o gateway do IPFS usando a URI salva
      // Dependendo de como seu IpfsService está configurado, você retorna um Blob
      const cid = transacaoRecebida.file_uri.replace('ipfs://', '');
      
      // 2. Usa o gateway da Cloudflare (ou ipfs.io) que tem políticas de CORS mais flexíveis para frontends
      const ipfsGatewayUrl = `https://cloudflare-ipfs.com/ipfs/${cid}`; 
      
      const encryptedBlob = await this.http.get(ipfsGatewayUrl, { responseType: 'blob' }).toPromise();

      if (!encryptedBlob) throw new Error('Falha ao baixar arquivo do IPFS');

      console.log('4. Descriptografando o arquivo (AES)...');
      // aes_iv é o Vetor de Inicialização público que viajou na transação
      const decryptedBlob = await this.cryptoService.decryptFile(
        encryptedBlob, 
        aesKey, 
        transacaoRecebida.aes_iv
      );

      console.log('5. Sucesso! Preparando o download no navegador...');
      this.dispararDownloadNoNavegador(decryptedBlob, 'arquivo_descriptografado'); // Idealmente, você salva o nome original nos metadados ou no BD

    } catch (error) {
      console.error('Falha na descriptografia:', error);
      alert('Acesso negado ou arquivo corrompido. Você é realmente o destinatário desta transação?');
    }
  }

  // Utilitário para forçar o navegador a baixar o Blob final como um arquivo real
  private dispararDownloadNoNavegador(blob: Blob, nomeArquivo: string) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }


  dispararTesteDescriptografia() {
    try {
      const transacaoObjeto = JSON.parse(this.transacaoJsonPasted);
      this.baixarEDescriptografarArquivo(transacaoObjeto);
    } catch (e) {
      alert('O formato da transação colada não é um JSON válido.');
      console.error('Erro de parse:', e);
    }
  }
}
