import { Node as VisNode, Options } from 'vis-network/standalone';

import { BlockData } from '../models/block-data.model';

export function obterOpcoesRede(): Options {
  return {
    autoResize: true,
    physics: false,
    layout: {
      hierarchical: {
        enabled: true,
        direction: 'UD',
        sortMethod: 'directed',
        levelSeparation: 130,
        nodeSpacing: 200,
        treeSpacing: 180,
      },
    },
    interaction: {
      hover: true,
      dragNodes: false,
      zoomView: true,
    },
    nodes: {
      shape: 'box',
      margin: {
        top: 10,
        right: 10,
        bottom: 10,
        left: 10,
      },
      widthConstraint: {
        maximum: 220,
      },
      font: {
        face: 'IBM Plex Mono',
        size: 12,
        color: '#f4f9ff',
      },
      borderWidth: 2,
    },
    edges: {
      arrows: {
        to: {
          enabled: true,
          scaleFactor: 0.8,
        },
      },
      smooth: {
        enabled: true,
        type: 'cubicBezier',
        forceDirection: 'vertical',
        roundness: 0.2,
      },
      color: '#7f8fb7',
    },
  };
}

export function hashCurto(hash: string): string {
  if (!hash) {
    return 'n/d';
  }

  return hash.slice(0, 10);
}

export function formatarRotuloNo(block: BlockData): string {
  return [
    `#${block.index}`,
    hashCurto(block.hash),
    `nonce: ${block.nonce ?? 0}`,
    `transacoes: ${block.tx_count ?? 0}`,
  ].join('\n');
}

export function formatarTooltipNo(block: BlockData): string {
  return [
    `indice: ${block.index}`,
    `hash: ${block.hash}`,
    `hash_anterior: ${block.previous_hash}`,
    `nonce: ${block.nonce ?? 0}`,
    `minerador: ${block.miner ?? 'n/d'}`,
    `qtd_transacoes: ${block.tx_count ?? 0}`,
    `cadeia_principal: ${Boolean(block.is_main)}`,
  ].join('\n');
}

export function corPorBloco(block: BlockData, isForkPoint = false): VisNode['color'] {
  if (isForkPoint) {
    return {
      background: '#ff5f77',
      border: '#ffd0d8',
      highlight: {
        background: '#ff7f93',
        border: '#ffd0d8',
      },
    };
  }

  if (block.is_main) {
    return {
      background: '#35b8ff',
      border: '#9ce0ff',
      highlight: {
        background: '#52c3ff',
        border: '#d2f1ff',
      },
    };
  }

  return {
    background: '#ffb347',
    border: '#ffe0b3',
    highlight: {
      background: '#ffc26b',
      border: '#fff0d5',
    },
  };
}
