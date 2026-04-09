import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CryptoService {

  // ==========================================
  // 1. DERIVAÇÃO DE CHAVE (PBKDF2)
  // ==========================================
  
  private async deriveKeyFromPassword(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const encoder = new TextEncoder();
    const passwordBuffer = encoder.encode(password);
    const baseKey = await window.crypto.subtle.importKey('raw', passwordBuffer, 'PBKDF2', false, ['deriveKey']);
    return await window.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: 100000, hash: 'SHA-256' },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  // ==========================================
  // 2. CRIPTOGRAFIA DE ARQUIVO (SIMÉTRICA)
  // ==========================================

  async encryptFile(file: File, password: string): Promise<Blob> {
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const aesKey = await this.deriveKeyFromPassword(password, salt);
    const fileBuffer = await file.arrayBuffer();
    const encryptedContent = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv }, aesKey, fileBuffer
    );
    return new Blob([salt, iv, encryptedContent]);
  }

  async decryptFile(encryptedBlob: Blob, password: string): Promise<Blob> {
    const buffer = await encryptedBlob.arrayBuffer();
    const salt = new Uint8Array(buffer.slice(0, 16));
    const iv = new Uint8Array(buffer.slice(16, 28));
    const encryptedContent = buffer.slice(28);
    const aesKey = await this.deriveKeyFromPassword(password, salt);
    const decryptedContent = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv }, aesKey, encryptedContent
    );
    return new Blob([decryptedContent]);
  }

  // ==========================================
  // 3. UTILITÁRIOS PARA RSA E PEM
  // ==========================================
  
  private pemToArrayBuffer(pem: string): ArrayBuffer {
    const b64Lines = pem.replace(/-----BEGIN[^-]+-----|-----END[^-]+-----/g, '');
    const b64Str = b64Lines.replace(/\s+/g, '');
    const byteStr = window.atob(b64Str);
    const bytes = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) {
       bytes[i] = byteStr.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
  }

  public arrayBufferToPem(buffer: ArrayBuffer, label: string): string {
    const base64 = this.arrayBufferToBase64(buffer);
    const matched = base64.match(/.{1,64}/g);
    const p = matched ? matched.join('\n') : '';
    return `-----BEGIN ${label}-----\n${p}\n-----END ${label}-----`;
  }

  async generateRsaKeyPair(): Promise<{ publicKey: string, privateKey: string }> {
    const keyPair = await window.crypto.subtle.generateKey(
      {
        name: "RSA-OAEP",
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: "SHA-256",
      },
      true,
      ["encrypt", "decrypt"]
    );

    const exportedPublicKey = await window.crypto.subtle.exportKey("spki", keyPair.publicKey);
    const exportedPrivateKey = await window.crypto.subtle.exportKey("pkcs8", keyPair.privateKey);

    return {
      publicKey: this.arrayBufferToPem(exportedPublicKey, "PUBLIC KEY"),
      privateKey: this.arrayBufferToPem(exportedPrivateKey, "PRIVATE KEY")
    };
  }

  async encryptWithPublicKey(data: string, pemPublicKey: string): Promise<string> {
    const pubKeyBuffer = this.pemToArrayBuffer(pemPublicKey);
    const cryptoKey = await window.crypto.subtle.importKey(
      "spki", pubKeyBuffer,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false, ["encrypt"]
    );
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(data);
    const encryptedData = await window.crypto.subtle.encrypt(
      { name: "RSA-OAEP" }, cryptoKey, encodedData
    );
    return this.arrayBufferToBase64(encryptedData);
  }

  async decryptWithPrivateKey(encryptedBase64: string, pemPrivateKey: string): Promise<string> {
    const privKeyBuffer = this.pemToArrayBuffer(pemPrivateKey);
    const cryptoKey = await window.crypto.subtle.importKey(
      "pkcs8", privKeyBuffer,
      { name: "RSA-OAEP", hash: "SHA-256" },
      false, ["decrypt"]
    );
    const encryptedDataBuffer = this.pemToArrayBuffer(`-----BEGIN DATA-----\n${encryptedBase64}\n-----END DATA-----`); // reuse function to parse base64 purely
    
    // direct from base64
    const b64Str = encryptedBase64.replace(/\s+/g, '');
    const byteStr = window.atob(b64Str);
    const bytes = new Uint8Array(byteStr.length);
    for (let i = 0; i < byteStr.length; i++) {
       bytes[i] = byteStr.charCodeAt(i);
    }

    const decryptedData = await window.crypto.subtle.decrypt(
      { name: "RSA-OAEP" }, cryptoKey, bytes.buffer
    );
    const decoder = new TextDecoder();
    return decoder.decode(decryptedData);
  }
}
