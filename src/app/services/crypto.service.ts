import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CryptoService {
  
  // 1. Gera uma chave AES-GCM de 256 bits aleatória
  async generateAESKey(): Promise<CryptoKey> {
    return await window.crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true, // Permite exportar a chave depois
      ['encrypt', 'decrypt']
    );
  }

  // 2. Criptografa o arquivo usando a chave AES
  async encryptFile(file: File, aesKey: CryptoKey): Promise<{ encryptedBlob: Blob, iv: Uint8Array }> {
    // O IV (Vetor de Inicialização) adiciona aleatoriedade. Deve ter 12 bytes para GCM.
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const fileBuffer = await file.arrayBuffer();

    const encryptedContent = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      aesKey,
      fileBuffer
    );

    // Retornamos o conteúdo criptografado e o IV (o destinatário precisará do IV para descriptografar)
    const encryptedBlob = new Blob([encryptedContent]);
    return { encryptedBlob, iv };
  }

  // 3. Importa a chave pública RSA do destinatário (Assumindo formato SPKI em Base64)
  async importPublicKey(base64PublicKey: string): Promise<CryptoKey> {
    // Remove cabeçalhos PEM se existirem (ex: -----BEGIN PUBLIC KEY-----)
    const cleanKey = base64PublicKey.replace(/(-----(BEGIN|END) PUBLIC KEY-----|\n|\r)/g, '');
    const binaryDer = this.base64ToArrayBuffer(cleanKey);

    return await window.crypto.subtle.importKey(
      'spki',
      binaryDer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      false,
      ['encrypt']
    );
  }

  // 4. Criptografa a chave AES usando a chave Pública RSA
  async encryptAESKeyWithRSA(aesKey: CryptoKey, rsaPublicKey: CryptoKey): Promise<string> {
    // Primeiro, exporta a chave AES para formato "raw" (bytes crus)
    const rawAesKey = await window.crypto.subtle.exportKey('raw', aesKey);

    // Criptografa os bytes crus com o RSA do destinatário
    const encryptedAesKeyBuffer = await window.crypto.subtle.encrypt(
      {
        name: 'RSA-OAEP'
      },
      rsaPublicKey,
      rawAesKey
    );

    // Retorna como Base64 para facilitar o tráfego no JSON (Kafka)
    return this.arrayBufferToBase64(encryptedAesKeyBuffer);
  }

  // ==========================================
  // Utilitários de Conversão (Base64 <-> Buffer)
  // ==========================================
  
  base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }


  // ==========================================
  // MÉTODOS DE DESCRIPTOGRAFIA (CAMINHO INVERSO)
  // ==========================================

  // 5. Importa a chave privada RSA do destinatário (Formato PKCS#8 em Base64)
  async importPrivateKey(base64PrivateKey: string): Promise<CryptoKey> {
    // Remove cabeçalhos PEM se existirem
    const cleanKey = base64PrivateKey.replace(/(-----(BEGIN|END) PRIVATE KEY-----|\n|\r)/g, '');
    const binaryDer = this.base64ToArrayBuffer(cleanKey);

    return await window.crypto.subtle.importKey(
      'pkcs8', // Chaves privadas usam pkcs8, públicas usam spki
      binaryDer,
      {
        name: 'RSA-OAEP',
        hash: 'SHA-256'
      },
      false,
      ['decrypt']
    );
  }

  // 6. Descriptografa a chave AES usando a chave Privada RSA do destinatário
  async decryptAESKeyWithRSA(encryptedAesKeyBase64: string, rsaPrivateKey: CryptoKey): Promise<CryptoKey> {
    const encryptedBytes = this.base64ToArrayBuffer(encryptedAesKeyBase64);

    // Isso devolve os bytes crus (raw buffer) da chave AES original
    const rawAesKeyBuffer = await window.crypto.subtle.decrypt(
      {
        name: 'RSA-OAEP'
      },
      rsaPrivateKey,
      encryptedBytes
    );

    // Importa os bytes crus de volta para um objeto CryptoKey do tipo AES-GCM
    return await window.crypto.subtle.importKey(
      'raw',
      rawAesKeyBuffer,
      { name: 'AES-GCM' },
      false,
      ['decrypt'] // Permissão apenas para descriptografar
    );
  }

  // 7. Descriptografa o arquivo usando a chave AES recuperada e o IV original
  async decryptFile(encryptedBlob: Blob, aesKey: CryptoKey, ivBase64: string): Promise<Blob> {
    const ivBuffer = this.base64ToArrayBuffer(ivBase64);
    const iv = new Uint8Array(ivBuffer);
    const encryptedBuffer = await encryptedBlob.arrayBuffer();

    const decryptedContent = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      aesKey,
      encryptedBuffer
    );

    return new Blob([decryptedContent]);
  }
}