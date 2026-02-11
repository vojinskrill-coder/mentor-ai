import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideUser, lucideArrowLeft } from '@ng-icons/lucide';
import { ExportSectionComponent } from './export-section/export-section.component';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [CommonModule, RouterLink, NgIcon, ExportSectionComponent],
  providers: [
    provideIcons({
      lucideUser,
      lucideArrowLeft,
    }),
  ],
  template: `
    <div class="min-h-screen bg-background">
      <header class="border-b border-border bg-card">
        <div class="container mx-auto px-4 py-4 flex items-center gap-3">
          <a routerLink="/dashboard" class="text-muted-foreground hover:text-foreground">
            <ng-icon name="lucideArrowLeft" class="h-5 w-5" />
          </a>
          <ng-icon name="lucideUser" class="h-6 w-6 text-primary" />
          <h1 class="text-xl font-semibold text-foreground">Profile Settings</h1>
        </div>
      </header>

      <main class="container mx-auto px-4 py-8 max-w-2xl space-y-8">
        <app-export-section />
      </main>
    </div>
  `,
})
export class ProfileSettingsComponent {}
