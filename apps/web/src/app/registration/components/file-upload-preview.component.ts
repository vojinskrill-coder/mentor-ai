import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  selector: 'app-file-upload-preview',
  standalone: true,
  styles: [
    `
      .preview-wrapper {
        display: inline-block;
        position: relative;
      }
      .preview-img {
        width: 80px;
        height: 80px;
        border-radius: 8px;
        object-fit: cover;
        border: 1px solid #2a2a2a;
      }
      .remove-btn {
        position: absolute;
        top: -8px;
        right: -8px;
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: none;
        background: #ef4444;
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        padding: 0;
      }
      .remove-btn:hover {
        background: #dc2626;
      }
      .remove-btn svg {
        width: 12px;
        height: 12px;
      }

      .upload-zone {
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px dashed #2a2a2a;
        border-radius: 8px;
        padding: 24px;
        cursor: pointer;
        transition: border-color 0.15s;
      }
      .upload-zone:hover {
        border-color: rgba(59, 130, 246, 0.5);
      }
      .upload-content {
        text-align: center;
      }
      .upload-icon {
        width: 32px;
        height: 32px;
        color: #9e9e9e;
        margin: 0 auto 8px;
      }
      .upload-text {
        font-size: 14px;
        margin: 0;
      }
      .upload-link {
        font-weight: 500;
        color: #3b82f6;
      }
      .upload-hint {
        font-size: 12px;
        color: #9e9e9e;
        margin-top: 4px;
      }
      .error-text {
        font-size: 13px;
        color: #ef4444;
        margin-top: 4px;
      }
      .file-input {
        display: none;
      }
    `,
  ],
  template: `
    @if (previewUrl) {
      <div class="preview-wrapper">
        <img [src]="previewUrl" alt="Pregled ikonice kompanije" class="preview-img" />
        <button type="button" class="remove-btn" (click)="removeFile()">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    } @else {
      <div class="upload-zone" (click)="fileInput.click()" (dragover)="onDragOver($event)" (drop)="onDrop($event)">
        <div class="upload-content">
          <svg class="upload-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <p class="upload-text">
            <span class="upload-link">Kliknite za otpremanje</span> ili prevucite
          </p>
          <p class="upload-hint">PNG ili JPG (maks. 2MB)</p>
        </div>
      </div>
    }

    @if (error) {
      <p class="error-text">{{ error }}</p>
    }

    <input #fileInput type="file" accept="image/png,image/jpeg,image/jpg" class="file-input" (change)="onFileChange($event)" />
  `,
})
export class FileUploadPreviewComponent {
  @Input() previewUrl: string | null = null;
  @Input() error: string | null = null;
  @Output() fileSelected = new EventEmitter<File>();
  @Output() fileRemoved = new EventEmitter<void>();

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files[0]) {
      this.fileSelected.emit(input.files[0]);
    }
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();

    if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
      this.fileSelected.emit(event.dataTransfer.files[0]);
    }
  }

  removeFile(): void {
    this.fileRemoved.emit();
  }
}
