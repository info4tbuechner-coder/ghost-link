import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { TextFieldModule } from '@angular/cdk/text-field';
import { CryptoService } from '../crypto.service';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Component({
  selector: 'app-create-message',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatIconModule,
    MatSnackBarModule,
    TextFieldModule
  ],
  templateUrl: './create-message.component.html',
  styleUrl: './create-message.component.css'
})
export class CreateMessageComponent {
  private fb = inject(FormBuilder);
  private cryptoService = inject(CryptoService);
  private http = inject(HttpClient);
  private snackBar = inject(MatSnackBar);

  messageForm = this.fb.group({
    message: ['', [Validators.required, Validators.maxLength(10000)]]
  });

  generatedLink = signal<string | null>(null);
  isLoading = signal(false);

  async createLink() {
    if (this.messageForm.invalid) return;

    this.isLoading.set(true);
    const message = this.messageForm.get('message')?.value || '';

    try {
      // 1. Generate Key
      const key = await this.cryptoService.generateKey();
      
      // 2. Encrypt Message
      const encryptedData = await this.cryptoService.encrypt(message, key);
      
      // 3. Send to Server
      const response = await firstValueFrom(
        this.http.post<{ id: string, expiresAt: number }>('/api/message', { encryptedData })
      );
      
      // 4. Construct Link with Key Fragment
      const keyBase64 = await this.cryptoService.exportKey(key);
      const link = `${window.location.origin}/m/${response.id}#key=${keyBase64}`;
      
      this.generatedLink.set(link);
      this.isLoading.set(false);

    } catch (error) {
      console.error('Error creating message:', error);
      this.snackBar.open('Failed to create message. Please try again.', 'Close', { duration: 3000 });
      this.isLoading.set(false);
    }
  }

  copyLink() {
    const link = this.generatedLink();
    if (link) {
      navigator.clipboard.writeText(link).then(() => {
        this.snackBar.open('Link copied to clipboard!', 'Close', { duration: 2000 });
      });
    }
  }

  async shareLink() {
    const link = this.generatedLink();
    if (link && navigator.share) {
      try {
        await navigator.share({
          title: 'GhostLink Message',
          text: 'I sent you a secure, self-destructing message.',
          url: link
        });
      } catch (err) {
        console.error('Share failed:', err);
      }
    } else {
      this.copyLink();
    }
  }

  reset() {
    this.generatedLink.set(null);
    this.messageForm.reset();
  }
}
