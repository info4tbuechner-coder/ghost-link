import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class CryptoService {

  // Generate a random AES-GCM key (256-bit)
  async generateKey(): Promise<CryptoKey> {
    return window.crypto.subtle.generateKey(
      {
        name: 'AES-GCM',
        length: 256
      },
      true,
      ['encrypt', 'decrypt']
    );
  }

  // Export key to raw bytes (for URL fragment)
  async exportKey(key: CryptoKey): Promise<string> {
    const exported = await window.crypto.subtle.exportKey('raw', key);
    return this.arrayBufferToBase64(exported);
  }

  // Import key from raw bytes (from URL fragment)
  async importKey(base64Key: string): Promise<CryptoKey> {
    const rawKey = this.base64ToArrayBuffer(base64Key);
    return window.crypto.subtle.importKey(
      'raw',
      rawKey,
      { name: 'AES-GCM' },
      true,
      ['encrypt', 'decrypt']
    );
  }

  // Encrypt data
  // Returns: Base64 string containing [IV (12 bytes) + Ciphertext]
  async encrypt(message: string, key: CryptoKey): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(message);
    
    // Generate random IV (12 bytes)
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      data
    );

    // Concatenate IV and Ciphertext
    const combined = new Uint8Array(iv.length + new Uint8Array(encrypted).length);
    combined.set(iv);
    combined.set(new Uint8Array(encrypted), iv.length);

    return this.arrayBufferToBase64(combined.buffer);
  }

  // Decrypt data
  // Expects: Base64 string containing [IV (12 bytes) + Ciphertext]
  async decrypt(encryptedBase64: string, key: CryptoKey): Promise<string> {
    const combined = this.base64ToArrayBuffer(encryptedBase64);
    const combinedArray = new Uint8Array(combined);

    // Extract IV (first 12 bytes)
    const iv = combinedArray.slice(0, 12);
    // Extract Ciphertext (rest)
    const ciphertext = combinedArray.slice(12);

    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv
      },
      key,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }

  // Helper: ArrayBuffer to Base64 (URL safe)
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  // Helper: Base64 (URL safe) to ArrayBuffer
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    // Restore standard Base64 characters
    let str = base64.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) {
      str += '=';
    }
    
    const binaryString = window.atob(str);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
