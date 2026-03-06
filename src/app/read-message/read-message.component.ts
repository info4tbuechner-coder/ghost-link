import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CryptoService } from '../crypto.service';
import { firstValueFrom } from 'rxjs';

type ViewState = 'validating' | 'idle' | 'decrypting' | 'success' | 'error';

@Component({
  selector: 'app-read-message',
  standalone: true,
  imports: [
    CommonModule,
    MatProgressSpinnerModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatSnackBarModule
  ],
  templateUrl: './read-message.component.html',
  styleUrl: './read-message.component.css'
})
export class ReadMessageComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private http = inject(HttpClient);
  private cryptoService = inject(CryptoService);
  private snackBar = inject(MatSnackBar);

  state = signal<ViewState>('validating');
  error = signal<string | null>(null);
  message = signal<string | null>(null);

  private id: string | null = null;
  private keyBase64: string | null = null;

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id');
    const fragment = this.route.snapshot.fragment;

    if (!this.id) {
      this.setError('Invalid link: Missing message ID.');
      return;
    }

    if (!fragment) {
      this.setError('Invalid link: Missing decryption key. Did you copy the full URL?');
      return;
    }

    // Extract key from fragment (e.g., #key=XYZ -> XYZ)
    const keyMatch = fragment.match(/key=([^&]*)/);
    this.keyBase64 = keyMatch ? keyMatch[1] : null;

    // Security: Clear the fragment from the URL immediately so the key is not in history
    window.history.replaceState(null, '', window.location.pathname);

    if (!this.keyBase64) {
      this.setError('Invalid link: Malformed key.');
      return;
    }

    // Link is valid, waiting for user to click reveal
    this.state.set('idle');
  }

  private setError(msg: string) {
    this.error.set(msg);
    this.state.set('error');
  }

  async revealMessage() {
    if (!this.id || !this.keyBase64) return;

    this.state.set('decrypting');

    try {
      // 1. Fetch encrypted data
      const response = await firstValueFrom(
        this.http.get<{ encryptedData: string }>(`/api/message/${this.id}`)
      );

      // 2. Import Key
      const key = await this.cryptoService.importKey(this.keyBase64);
      
      // 3. Decrypt
      const decryptedMessage = await this.cryptoService.decrypt(response.encryptedData, key);
      
      this.message.set(decryptedMessage);
      this.state.set('success');

    } catch (err: any) {
      console.error('Operation failed:', err);
      
      if (err.status === 404) {
        this.setError('Message not found. It may have been read already or expired.');
      } else if (err.name === 'OperationError') {
         this.setError('Decryption failed. The key might be incorrect or the message corrupted.');
      } else {
        this.setError('Failed to retrieve message. Please try again later.');
      }
    }
  }

  copyMessage() {
    const msg = this.message();
    if (msg) {
      navigator.clipboard.writeText(msg).then(() => {
        this.snackBar.open('Message copied to clipboard!', 'Close', { duration: 2000 });
      });
    }
  }

  goHome() {
    this.router.navigate(['/']);
  }
}
