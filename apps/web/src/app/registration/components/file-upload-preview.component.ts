import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideUpload, lucideX, lucideImage } from '@ng-icons/lucide';

@Component({
  selector: 'app-file-upload-preview',
  standalone: true,
  imports: [CommonModule, NgIcon],
  providers: [provideIcons({ lucideUpload, lucideX, lucideImage })],
  template: `
    @if (previewUrl) {
      <!-- Preview state -->
      <div class="relative inline-block">
        <img
          [src]="previewUrl"
          alt="Company icon preview"
          class="h-20 w-20 rounded-lg object-cover border border-input"
        />
        <button
          type="button"
          (click)="removeFile()"
          class="absolute -top-2 -right-2 rounded-full bg-destructive p-1 text-destructive-foreground hover:bg-destructive/90"
        >
          <ng-icon name="lucideX" class="h-3 w-3" />
        </button>
      </div>
    } @else {
      <!-- Upload state -->
      <div
        class="flex items-center justify-center border-2 border-dashed border-input rounded-lg p-6 hover:border-primary/50 transition-colors cursor-pointer"
        (click)="fileInput.click()"
        (dragover)="onDragOver($event)"
        (drop)="onDrop($event)"
      >
        <div class="text-center">
          <ng-icon name="lucideImage" class="mx-auto h-8 w-8 text-muted-foreground" />
          <p class="mt-2 text-sm text-foreground">
            <span class="font-medium text-primary">Click to upload</span>
            or drag and drop
          </p>
          <p class="text-xs text-muted-foreground">PNG or JPG (max. 2MB)</p>
        </div>
      </div>
    }

    @if (error) {
      <p class="mt-1 text-sm text-destructive">{{ error }}</p>
    }

    <input
      #fileInput
      type="file"
      accept="image/png,image/jpeg,image/jpg"
      class="hidden"
      (change)="onFileChange($event)"
    />
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
