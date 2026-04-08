import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../../environments/environment';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class IpfsService {
  private pinataUrl = 'https://api.pinata.cloud/pinning/pinFileToIPFS';

  constructor(private http: HttpClient) {}

  // Recebe o arquivo criptografado e joga pro IPFS
  async uploadFile(file: File | Blob, filename: string): Promise<string> {
    const formData = new FormData();
    formData.append('file', file, filename);

    const headers = new HttpHeaders({
      'pinata_api_key': environment.pinataApiKey,
      'pinata_secret_api_key': environment.pinataSecretKey
    });

    try {
      // Faz o POST e espera a resposta
      const response: any = await firstValueFrom(this.http.post(this.pinataUrl, formData, { headers }));
      
      // O Pinata devolve um IpfsHash. Nós montamos a URI padrão.
      return `ipfs://${response.IpfsHash}`;
    } catch (error) {
      console.error('Erro ao subir para o IPFS', error);
      throw error;
    }
  }
}