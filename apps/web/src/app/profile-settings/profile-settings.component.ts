import { Component } from '@angular/core';
import { ExportSectionComponent } from './export-section/export-section.component';

@Component({
  selector: 'app-profile-settings',
  standalone: true,
  imports: [ExportSectionComponent],
  styles: [
    `
      :host {
        display: block;
      }
      .page-content {
        max-width: 640px;
        margin: 0 auto;
        padding: 32px 24px;
      }
      .page-title {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .page-desc {
        font-size: 14px;
        color: #9e9e9e;
        margin-bottom: 32px;
        line-height: 1.5;
      }
    `,
  ],
  template: `
    <div class="page-content">
      <h1 class="page-title">Podešavanja profila</h1>
      <p class="page-desc">Upravljajte podacima profila, izvozom podataka i bezbednosnim opcijama.</p>
      <app-export-section />
    </div>
  `,
})
export class ProfileSettingsComponent {}
