import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MemoryAttributionComponent } from './memory-attribution.component';
import type { MemoryAttribution, MemoryType } from '@mentor-ai/shared/types';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('MemoryAttributionComponent', () => {
  let component: MemoryAttributionComponent;
  let fixture: ComponentFixture<MemoryAttributionComponent>;

  const mockAttributions: MemoryAttribution[] = [
    {
      memoryId: 'mem_client1',
      subject: 'Acme Corp',
      summary: 'has a budget of $50,000 for this project',
      type: 'CLIENT_CONTEXT' as MemoryType,
    },
    {
      memoryId: 'mem_project1',
      subject: 'Project Phoenix',
      summary: 'deadline is end of Q1 2026',
      type: 'PROJECT_CONTEXT' as MemoryType,
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MemoryAttributionComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(MemoryAttributionComponent);
    component = fixture.componentInstance;
  });

  describe('rendering', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should not render when no attributions provided', () => {
      fixture.componentRef.setInput('attributions', []);
      fixture.detectChanges();

      const container = fixture.nativeElement.querySelector('.memory-attribution-container');
      expect(container).toBeNull();
    });

    it('should render when attributions are provided', () => {
      fixture.componentRef.setInput('attributions', mockAttributions);
      fixture.detectChanges();

      const container = fixture.nativeElement.querySelector('.memory-attribution-container');
      expect(container).toBeTruthy();
    });

    it('should display primary subject in collapsed view', () => {
      fixture.componentRef.setInput('attributions', mockAttributions);
      fixture.detectChanges();

      const text = fixture.nativeElement.querySelector('.attribution-text');
      expect(text.textContent).toContain('Acme Corp');
    });

    it('should show additional count when multiple attributions', () => {
      fixture.componentRef.setInput('attributions', mockAttributions);
      fixture.detectChanges();

      const additionalCount = fixture.nativeElement.querySelector('.additional-count');
      expect(additionalCount.textContent).toContain('+1 more');
    });

    it('should not show additional count for single attribution', () => {
      fixture.componentRef.setInput('attributions', [mockAttributions[0]]);
      fixture.detectChanges();

      const additionalCount = fixture.nativeElement.querySelector('.additional-count');
      expect(additionalCount).toBeNull();
    });
  });

  describe('expand/collapse', () => {
    it('should start collapsed', () => {
      fixture.componentRef.setInput('attributions', mockAttributions);
      fixture.detectChanges();

      expect(component.isExpanded$()).toBe(false);
      const details = fixture.nativeElement.querySelector('.attribution-details');
      expect(details).toBeNull();
    });

    it('should expand when toggle clicked', () => {
      fixture.componentRef.setInput('attributions', mockAttributions);
      fixture.detectChanges();

      const toggle = fixture.nativeElement.querySelector('.attribution-toggle');
      toggle.click();
      fixture.detectChanges();

      expect(component.isExpanded$()).toBe(true);
      const details = fixture.nativeElement.querySelector('.attribution-details');
      expect(details).toBeTruthy();
    });

    it('should collapse when toggle clicked again', () => {
      fixture.componentRef.setInput('attributions', mockAttributions);
      fixture.detectChanges();

      const toggle = fixture.nativeElement.querySelector('.attribution-toggle');
      toggle.click();
      fixture.detectChanges();
      toggle.click();
      fixture.detectChanges();

      expect(component.isExpanded$()).toBe(false);
    });

    it('should display all attributions when expanded', () => {
      fixture.componentRef.setInput('attributions', mockAttributions);
      fixture.detectChanges();

      component.toggleExpand();
      fixture.detectChanges();

      const items = fixture.nativeElement.querySelectorAll('.attribution-item');
      expect(items.length).toBe(2);
    });
  });

  describe('attribution items', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('attributions', mockAttributions);
      fixture.detectChanges();
      component.toggleExpand();
      fixture.detectChanges();
    });

    it('should display type badge for each attribution', () => {
      const badges = fixture.nativeElement.querySelectorAll('.type-badge');
      expect(badges.length).toBe(2);
      expect(badges[0].textContent.trim()).toBe('Client');
      expect(badges[1].textContent.trim()).toBe('Project');
    });

    it('should display subject for each attribution', () => {
      const subjects = fixture.nativeElement.querySelectorAll('.subject');
      expect(subjects[0].textContent.trim()).toBe('Acme Corp');
      expect(subjects[1].textContent.trim()).toBe('Project Phoenix');
    });

    it('should display summary for each attribution', () => {
      const summaries = fixture.nativeElement.querySelectorAll('.summary');
      expect(summaries[0].textContent).toContain('budget of $50,000');
      expect(summaries[1].textContent).toContain('deadline');
    });

    it('should have view details button for each attribution', () => {
      const viewButtons = fixture.nativeElement.querySelectorAll('.view-btn');
      expect(viewButtons.length).toBe(2);
      expect(viewButtons[0].textContent.trim()).toBe('View details');
    });

    it('should have outdated button for each attribution', () => {
      const outdatedButtons = fixture.nativeElement.querySelectorAll('.outdated-btn');
      expect(outdatedButtons.length).toBe(2);
      expect(outdatedButtons[0].textContent.trim()).toBe('This is outdated');
    });
  });

  describe('events', () => {
    beforeEach(() => {
      fixture.componentRef.setInput('attributions', mockAttributions);
      fixture.detectChanges();
      component.toggleExpand();
      fixture.detectChanges();
    });

    it('should emit attributionClick when view details clicked', () => {
      const clickSpy = vi.fn();
      component.attributionClick.subscribe(clickSpy);

      const viewButtons = fixture.nativeElement.querySelectorAll('.view-btn');
      viewButtons[0].click();

      expect(clickSpy).toHaveBeenCalledWith(mockAttributions[0]);
    });

    it('should emit outdatedClick when outdated clicked', () => {
      const outdatedSpy = vi.fn();
      component.outdatedClick.subscribe(outdatedSpy);

      const outdatedButtons = fixture.nativeElement.querySelectorAll('.outdated-btn');
      outdatedButtons[1].click();

      expect(outdatedSpy).toHaveBeenCalledWith(mockAttributions[1]);
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

    it('should return correct label for CLIENT_CONTEXT', () => {
      expect(component.getTypeLabel('CLIENT_CONTEXT' as MemoryType)).toBe('Client');
    });

    it('should return correct label for PROJECT_CONTEXT', () => {
      expect(component.getTypeLabel('PROJECT_CONTEXT' as MemoryType)).toBe('Project');
    });

    it('should return correct label for USER_PREFERENCE', () => {
      expect(component.getTypeLabel('USER_PREFERENCE' as MemoryType)).toBe('Preference');
    });

    it('should return correct label for FACTUAL_STATEMENT', () => {
      expect(component.getTypeLabel('FACTUAL_STATEMENT' as MemoryType)).toBe('Fact');
    });
  });

  describe('accessibility', () => {
    it('should have aria-expanded on toggle button', () => {
      fixture.componentRef.setInput('attributions', mockAttributions);
      fixture.detectChanges();

      const toggle = fixture.nativeElement.querySelector('.attribution-toggle');
      expect(toggle.getAttribute('aria-expanded')).toBe('false');

      component.toggleExpand();
      fixture.detectChanges();

      expect(toggle.getAttribute('aria-expanded')).toBe('true');
    });

    it('should have aria-controls pointing to details region', () => {
      fixture.componentRef.setInput('attributions', mockAttributions);
      fixture.detectChanges();

      const toggle = fixture.nativeElement.querySelector('.attribution-toggle');
      expect(toggle.getAttribute('aria-controls')).toBe('attribution-details');
    });

    it('should have role="region" on details', () => {
      fixture.componentRef.setInput('attributions', mockAttributions);
      fixture.detectChanges();
      component.toggleExpand();
      fixture.detectChanges();

      const details = fixture.nativeElement.querySelector('.attribution-details');
      expect(details.getAttribute('role')).toBe('region');
    });

    it('should have aria-label on details region', () => {
      fixture.componentRef.setInput('attributions', mockAttributions);
      fixture.detectChanges();
      component.toggleExpand();
      fixture.detectChanges();

      const details = fixture.nativeElement.querySelector('.attribution-details');
      expect(details.getAttribute('aria-label')).toBe('Memory attribution details');
    });
  });
});
