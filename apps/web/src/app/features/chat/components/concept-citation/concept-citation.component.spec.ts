import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConceptCitationComponent } from './concept-citation.component';
import type { ConceptCitation, ConceptCategory } from '@mentor-ai/shared/types';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ConceptCitationComponent', () => {
  let component: ConceptCitationComponent;
  let fixture: ComponentFixture<ConceptCitationComponent>;

  const mockCitations: ConceptCitation[] = [
    {
      id: 'cit_test1',
      messageId: 'msg_test',
      conceptId: 'cpt_pricing',
      conceptName: 'Value-Based Pricing',
      conceptCategory: 'Finance' as ConceptCategory,
      position: 20,
      score: 0.85,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'cit_test2',
      messageId: 'msg_test',
      conceptId: 'cpt_roi',
      conceptName: 'ROI',
      conceptCategory: 'Finance' as ConceptCategory,
      position: 50,
      score: 0.9,
      createdAt: new Date().toISOString(),
    },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConceptCitationComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ConceptCitationComponent);
    component = fixture.componentInstance;
  });

  describe('rendering', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should render plain text without citations', () => {
      fixture.componentRef.setInput('content', 'Plain text without any citations.');
      fixture.componentRef.setInput('citations', []);
      fixture.detectChanges();

      const element = fixture.nativeElement;
      expect(element.textContent).toContain('Plain text without any citations.');
      expect(element.querySelectorAll('.citation-badge').length).toBe(0);
    });

    it('should render citation badges for [[Concept]] patterns', () => {
      fixture.componentRef.setInput(
        'content',
        'Consider [[Value-Based Pricing]] for your [[ROI]].'
      );
      fixture.componentRef.setInput('citations', mockCitations);
      fixture.detectChanges();

      const badges = fixture.nativeElement.querySelectorAll('.citation-badge');
      expect(badges.length).toBe(2);
      expect(badges[0].textContent.trim()).toBe('Value-Based Pricing');
      expect(badges[1].textContent.trim()).toBe('ROI');
    });

    it('should apply category-specific styling', () => {
      fixture.componentRef.setInput(
        'content',
        'Consider [[Value-Based Pricing]] for your strategy.'
      );
      fixture.componentRef.setInput('citations', [mockCitations[0]]);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.citation-badge');
      expect(badge.classList.contains('finance')).toBe(true);
    });
  });

  describe('parsing', () => {
    it('should correctly parse content with multiple citations', () => {
      fixture.componentRef.setInput(
        'content',
        'Start [[First]] middle [[Second]] end [[Third]].'
      );
      fixture.componentRef.setInput('citations', []);
      fixture.detectChanges();

      const segments = component.segments$();
      const citationSegments = segments.filter((s) => s.type === 'citation');
      expect(citationSegments.length).toBe(3);
    });

    it('should preserve text between citations', () => {
      fixture.componentRef.setInput(
        'content',
        'Before [[First]] middle [[Second]] after.'
      );
      fixture.componentRef.setInput('citations', []);
      fixture.detectChanges();

      const segments = component.segments$();
      expect(segments.length).toBeGreaterThan(0);
      expect(segments[0]?.type).toBe('text');
      expect(segments[0]?.content).toContain('Before');
    });

    it('should handle content with no citations', () => {
      fixture.componentRef.setInput('content', 'Just plain text.');
      fixture.componentRef.setInput('citations', []);
      fixture.detectChanges();

      const segments = component.segments$();
      expect(segments.length).toBe(1);
      expect(segments[0]?.type).toBe('text');
    });
  });

  describe('interactions', () => {
    it('should emit citationClick when badge is clicked', () => {
      const citationClickSpy = vi.fn();
      component.citationClick.subscribe(citationClickSpy);

      fixture.componentRef.setInput(
        'content',
        'Consider [[Value-Based Pricing]] for strategy.'
      );
      fixture.componentRef.setInput('citations', [mockCitations[0]]);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.citation-badge');
      badge.click();

      expect(citationClickSpy).toHaveBeenCalledWith(mockCitations[0]);
    });

    it('should emit concept name when citation data not available', () => {
      const citationClickSpy = vi.fn();
      component.citationClick.subscribe(citationClickSpy);

      fixture.componentRef.setInput(
        'content',
        'Consider [[Unknown Concept]] for strategy.'
      );
      fixture.componentRef.setInput('citations', []); // No citation data
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.citation-badge');
      badge.click();

      expect(citationClickSpy).toHaveBeenCalledWith('Unknown Concept');
    });

    it('should handle keyboard navigation (Enter)', () => {
      const citationClickSpy = vi.fn();
      component.citationClick.subscribe(citationClickSpy);

      fixture.componentRef.setInput(
        'content',
        'Consider [[Value-Based Pricing]] for strategy.'
      );
      fixture.componentRef.setInput('citations', [mockCitations[0]]);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.citation-badge');
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      badge.dispatchEvent(event);

      expect(citationClickSpy).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should have proper aria-label on badges', () => {
      fixture.componentRef.setInput(
        'content',
        'Consider [[Value-Based Pricing]] for strategy.'
      );
      fixture.componentRef.setInput('citations', [mockCitations[0]]);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.citation-badge');
      expect(badge.getAttribute('aria-label')).toContain('Value-Based Pricing');
    });

    it('should have role="button" on badges', () => {
      fixture.componentRef.setInput('content', 'Consider [[Test]] concept.');
      fixture.componentRef.setInput('citations', []);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.citation-badge');
      expect(badge.getAttribute('role')).toBe('button');
    });

    it('should be focusable with tabindex', () => {
      fixture.componentRef.setInput('content', 'Consider [[Test]] concept.');
      fixture.componentRef.setInput('citations', []);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.citation-badge');
      expect(badge.getAttribute('tabindex')).toBe('0');
    });
  });
});
