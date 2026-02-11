import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { MemoryCorrectionDialogComponent, MemoryCorrectionResult } from './memory-correction-dialog.component';
import type { Memory, MemoryType, MemorySource } from '@mentor-ai/shared/types';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('MemoryCorrectionDialogComponent', () => {
  let component: MemoryCorrectionDialogComponent;
  let fixture: ComponentFixture<MemoryCorrectionDialogComponent>;

  const mockMemory: Memory = {
    id: 'mem_test123',
    tenantId: 'tnt_test',
    userId: 'usr_test',
    type: 'CLIENT_CONTEXT' as MemoryType,
    source: 'AI_EXTRACTED' as MemorySource,
    content: 'Acme Corp has a budget of $50,000',
    subject: 'Acme Corp',
    confidence: 0.92,
    createdAt: '2026-02-05T10:00:00.000Z',
    updatedAt: '2026-02-05T10:00:00.000Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemoryCorrectionDialogComponent, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(MemoryCorrectionDialogComponent);
    component = fixture.componentInstance;
  });

  describe('rendering', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should not render dialog when isOpen is false', () => {
      fixture.componentRef.setInput('isOpen', false);
      fixture.componentRef.setInput('memory', mockMemory);
      fixture.detectChanges();

      const dialog = fixture.nativeElement.querySelector('.dialog-container');
      expect(dialog).toBeNull();
    });

    it('should render dialog when isOpen is true', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.componentRef.setInput('memory', mockMemory);
      fixture.detectChanges();

      const dialog = fixture.nativeElement.querySelector('.dialog-container');
      expect(dialog).toBeTruthy();
    });

    it('should display memory subject in dialog', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.componentRef.setInput('memory', mockMemory);
      fixture.detectChanges();

      const subject = fixture.nativeElement.querySelector('.subject');
      expect(subject.textContent).toContain('Acme Corp');
    });

    it('should display original content', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.componentRef.setInput('memory', mockMemory);
      fixture.detectChanges();

      const original = fixture.nativeElement.querySelector('.original-content');
      expect(original.textContent).toContain('$50,000');
    });

    it('should display type badge', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.componentRef.setInput('memory', mockMemory);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.type-badge');
      expect(badge.textContent).toContain('Client');
    });
  });

  describe('form behavior', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.componentRef.setInput('memory', mockMemory);
      fixture.detectChanges();
    });

    it('should pre-fill corrected content with original content', () => {
      // Trigger ngOnChanges
      component.ngOnChanges();
      fixture.detectChanges();

      expect(component.correctedContent).toBe(mockMemory.content);
    });

    it('should disable save button when corrected content is empty', () => {
      component.correctedContent = '';
      fixture.detectChanges();

      const saveBtn = fixture.nativeElement.querySelector('.btn-primary');
      expect(saveBtn.disabled).toBe(true);
    });

    it('should enable save button when corrected content has value', () => {
      component.correctedContent = 'Updated content';
      fixture.detectChanges();

      const saveBtn = fixture.nativeElement.querySelector('.btn-primary');
      expect(saveBtn.disabled).toBe(false);
    });

    it('should disable save button when saving', () => {
      component.correctedContent = 'Updated content';
      component.isSaving$.set(true);
      fixture.detectChanges();

      const saveBtn = fixture.nativeElement.querySelector('.btn-primary');
      expect(saveBtn.disabled).toBe(true);
    });

    it('should show spinner when saving', () => {
      component.correctedContent = 'Updated content';
      component.isSaving$.set(true);
      fixture.detectChanges();

      const spinner = fixture.nativeElement.querySelector('.spinner');
      expect(spinner).toBeTruthy();
    });
  });

  describe('validation', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.componentRef.setInput('memory', mockMemory);
      fixture.detectChanges();
    });

    it('should show error when submitting empty content', () => {
      component.correctedContent = '   ';
      component.onSave();
      fixture.detectChanges();

      expect(component.hasError$()).toBe(true);
      const errorText = fixture.nativeElement.querySelector('.error-text');
      expect(errorText).toBeTruthy();
    });

    it('should clear error when content is provided', () => {
      component.hasError$.set(true);
      component.correctedContent = 'Valid content';
      component.onSave();

      expect(component.hasError$()).toBe(false);
    });
  });

  describe('events', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.componentRef.setInput('memory', mockMemory);
      fixture.detectChanges();
    });

    it('should emit save event with correction result', () => {
      const saveSpy = vi.fn();
      component.save.subscribe(saveSpy);

      component.correctedContent = 'Acme Corp has a budget of $75,000';
      component.onSave();

      expect(saveSpy).toHaveBeenCalledWith({
        memoryId: 'mem_test123',
        newContent: 'Acme Corp has a budget of $75,000',
      } as MemoryCorrectionResult);
    });

    it('should emit cancel event when cancel button clicked', () => {
      const cancelSpy = vi.fn();
      component.cancel.subscribe(cancelSpy);

      const cancelBtn = fixture.nativeElement.querySelector('.btn-secondary');
      cancelBtn.click();

      expect(cancelSpy).toHaveBeenCalled();
    });

    it('should emit cancel event when backdrop clicked', () => {
      const cancelSpy = vi.fn();
      component.cancel.subscribe(cancelSpy);

      const backdrop = fixture.nativeElement.querySelector('.dialog-backdrop');
      backdrop.click();

      expect(cancelSpy).toHaveBeenCalled();
    });

    it('should emit cancel event when close button clicked', () => {
      const cancelSpy = vi.fn();
      component.cancel.subscribe(cancelSpy);

      const closeBtn = fixture.nativeElement.querySelector('.close-button');
      closeBtn.click();

      expect(cancelSpy).toHaveBeenCalled();
    });

    it('should reset form state on cancel', () => {
      component.correctedContent = 'Some content';
      component.hasError$.set(true);

      component.onCancel();

      expect(component.correctedContent).toBe('');
      expect(component.hasError$()).toBe(false);
    });
  });

  describe('accessibility', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.componentRef.setInput('memory', mockMemory);
      fixture.detectChanges();
    });

    it('should have role="dialog" on container', () => {
      const dialog = fixture.nativeElement.querySelector('.dialog-container');
      expect(dialog.getAttribute('role')).toBe('dialog');
    });

    it('should have aria-modal="true"', () => {
      const dialog = fixture.nativeElement.querySelector('.dialog-container');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
    });

    it('should have aria-label with subject', () => {
      const dialog = fixture.nativeElement.querySelector('.dialog-container');
      expect(dialog.getAttribute('aria-label')).toContain('Acme Corp');
    });

    it('should have aria-label on close button', () => {
      const closeBtn = fixture.nativeElement.querySelector('.close-button');
      expect(closeBtn.getAttribute('aria-label')).toBe('Close dialog');
    });

    it('should have associated label for textarea', () => {
      const textarea = fixture.nativeElement.querySelector('#corrected-content');
      const label = fixture.nativeElement.querySelector('label[for="corrected-content"]');
      expect(textarea).toBeTruthy();
      expect(label).toBeTruthy();
    });

    it('should have aria-invalid on textarea when error', () => {
      component.hasError$.set(true);
      fixture.detectChanges();

      const textarea = fixture.nativeElement.querySelector('.form-textarea');
      expect(textarea.getAttribute('aria-invalid')).toBe('true');
    });

    it('should have role="alert" on error message', () => {
      component.hasError$.set(true);
      fixture.detectChanges();

      const error = fixture.nativeElement.querySelector('.error-text');
      expect(error.getAttribute('role')).toBe('alert');
    });
  });

  describe('type colors and labels', () => {
    it('should return correct color for CLIENT_CONTEXT', () => {
      expect(component.getTypeColor('CLIENT_CONTEXT' as MemoryType)).toBe('#3B82F6');
    });

    it('should return correct color for PROJECT_CONTEXT', () => {
      expect(component.getTypeColor('PROJECT_CONTEXT' as MemoryType)).toBe('#8B5CF6');
    });

    it('should return correct color for USER_PREFERENCE', () => {
      expect(component.getTypeColor('USER_PREFERENCE' as MemoryType)).toBe('#10B981');
    });

    it('should return correct color for FACTUAL_STATEMENT', () => {
      expect(component.getTypeColor('FACTUAL_STATEMENT' as MemoryType)).toBe('#6B7280');
    });

    it('should return correct label for all types', () => {
      expect(component.getTypeLabel('CLIENT_CONTEXT' as MemoryType)).toBe('Client');
      expect(component.getTypeLabel('PROJECT_CONTEXT' as MemoryType)).toBe('Project');
      expect(component.getTypeLabel('USER_PREFERENCE' as MemoryType)).toBe('Preference');
      expect(component.getTypeLabel('FACTUAL_STATEMENT' as MemoryType)).toBe('Fact');
    });
  });
});
