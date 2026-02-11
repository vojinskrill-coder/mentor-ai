import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ConceptPanelComponent } from './concept-panel.component';
import type { ConceptCitationSummary, ConceptCategory } from '@mentor-ai/shared/types';
import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('ConceptPanelComponent', () => {
  let component: ConceptPanelComponent;
  let fixture: ComponentFixture<ConceptPanelComponent>;
  let httpMock: HttpTestingController;

  const mockConceptSummary: ConceptCitationSummary = {
    id: 'cpt_pricing',
    name: 'Value-Based Pricing',
    category: 'Finance' as ConceptCategory,
    definition: 'A pricing strategy where prices are based on the perceived value to the customer.',
    relatedConcepts: [
      { id: 'cpt_roi', name: 'ROI' },
      { id: 'cpt_margin', name: 'Profit Margin' },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConceptPanelComponent, HttpClientTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ConceptPanelComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  describe('rendering', () => {
    it('should create', () => {
      expect(component).toBeTruthy();
    });

    it('should not render panel when isOpen is false', () => {
      fixture.componentRef.setInput('isOpen', false);
      fixture.detectChanges();

      const panel = fixture.nativeElement.querySelector('.concept-panel');
      expect(panel).toBeNull();
    });

    it('should render panel when isOpen is true', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();

      const panel = fixture.nativeElement.querySelector('.concept-panel');
      expect(panel).toBeTruthy();
    });

    it('should show loading skeleton when loading', () => {
      fixture.componentRef.setInput('isOpen', true);
      component.isLoading$.set(true);
      fixture.detectChanges();

      const skeletons = fixture.nativeElement.querySelectorAll('.skeleton');
      expect(skeletons.length).toBeGreaterThan(0);
    });

    it('should display concept data when loaded', () => {
      fixture.componentRef.setInput('isOpen', true);
      component.concept$.set(mockConceptSummary);
      fixture.detectChanges();

      const name = fixture.nativeElement.querySelector('.concept-name');
      expect(name.textContent.trim()).toBe('Value-Based Pricing');

      const definition = fixture.nativeElement.querySelector('.definition');
      expect(definition.textContent).toContain('perceived value');
    });

    it('should show error message when error occurs', () => {
      fixture.componentRef.setInput('isOpen', true);
      component.error$.set('Failed to load concept details: Network error');
      fixture.detectChanges();

      const error = fixture.nativeElement.querySelector('.error-message');
      expect(error.textContent).toContain('Failed to load concept details');
    });

    it('should show retry button on error', () => {
      fixture.componentRef.setInput('isOpen', true);
      component.error$.set('Some error');
      fixture.detectChanges();

      const retryButton = fixture.nativeElement.querySelector('.retry-button');
      expect(retryButton).toBeTruthy();
      expect(retryButton.textContent.trim()).toBe('Retry');
    });

    it('should display related concepts as chips', () => {
      fixture.componentRef.setInput('isOpen', true);
      component.concept$.set(mockConceptSummary);
      fixture.detectChanges();

      const chips = fixture.nativeElement.querySelectorAll('.related-chip');
      expect(chips.length).toBe(2);
      expect(chips[0].textContent.trim()).toBe('ROI');
      expect(chips[1].textContent.trim()).toBe('Profit Margin');
    });
  });

  describe('category styling', () => {
    it('should return lowercase category for getCategoryClass', () => {
      expect(component.getCategoryClass('Finance' as ConceptCategory)).toBe('finance');
      expect(component.getCategoryClass('Marketing' as ConceptCategory)).toBe('marketing');
      expect(component.getCategoryClass('Technology' as ConceptCategory)).toBe('technology');
    });

    it('should return empty string for undefined category', () => {
      expect(component.getCategoryClass(undefined)).toBe('');
    });

    it('should apply category class to badge', () => {
      fixture.componentRef.setInput('isOpen', true);
      component.concept$.set(mockConceptSummary);
      fixture.detectChanges();

      const badge = fixture.nativeElement.querySelector('.category-badge');
      expect(badge.classList.contains('finance')).toBe(true);
    });
  });

  describe('API integration', () => {
    it('should call loadConcept and fetch data via HTTP', async () => {
      fixture.componentRef.setInput('conceptId', 'cpt_pricing');
      fixture.detectChanges();

      // Call loadConcept directly
      const loadPromise = component.loadConcept();

      const req = httpMock.expectOne('/api/v1/knowledge/concepts/cpt_pricing/summary');
      expect(req.request.method).toBe('GET');
      req.flush({ data: mockConceptSummary });

      await loadPromise;

      expect(component.concept$()).toEqual(mockConceptSummary);
      expect(component.isLoading$()).toBe(false);
    });

    it('should set error on API failure', async () => {
      fixture.componentRef.setInput('conceptId', 'cpt_invalid');
      fixture.detectChanges();

      const loadPromise = component.loadConcept();

      const req = httpMock.expectOne('/api/v1/knowledge/concepts/cpt_invalid/summary');
      req.error(new ErrorEvent('Network error'));

      await loadPromise;

      expect(component.error$()).toContain('Failed to load concept details');
      expect(component.isLoading$()).toBe(false);
    });

    it('should not fetch if conceptId is null', async () => {
      fixture.componentRef.setInput('conceptId', null);
      fixture.detectChanges();

      await component.loadConcept();

      // No HTTP request should be made
      expect(httpMock.match(() => true).length).toBe(0);
    });
  });

  describe('interactions', () => {
    it('should emit close when backdrop is clicked', () => {
      const closeSpy = vi.fn();
      component.close.subscribe(closeSpy);

      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();

      const backdrop = fixture.nativeElement.querySelector('.panel-backdrop');
      backdrop.click();

      expect(closeSpy).toHaveBeenCalled();
    });

    it('should emit close when close button is clicked', () => {
      const closeSpy = vi.fn();
      component.close.subscribe(closeSpy);

      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();

      const closeButton = fixture.nativeElement.querySelector('.close-button');
      closeButton.click();

      expect(closeSpy).toHaveBeenCalled();
    });

    it('should emit conceptClick when related concept is clicked', () => {
      const conceptClickSpy = vi.fn();
      component.conceptClick.subscribe(conceptClickSpy);

      fixture.componentRef.setInput('isOpen', true);
      component.concept$.set(mockConceptSummary);
      fixture.detectChanges();

      const chip = fixture.nativeElement.querySelector('.related-chip');
      chip.click();

      expect(conceptClickSpy).toHaveBeenCalledWith('cpt_roi');
    });

    it('should emit learnMore when Learn More button is clicked', () => {
      const learnMoreSpy = vi.fn();
      component.learnMore.subscribe(learnMoreSpy);

      fixture.componentRef.setInput('isOpen', true);
      component.concept$.set(mockConceptSummary);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('.learn-more-button');
      button.click();

      expect(learnMoreSpy).toHaveBeenCalledWith('cpt_pricing');
    });

    it('should disable Learn More button when no concept loaded', () => {
      fixture.componentRef.setInput('isOpen', true);
      component.concept$.set(null);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('.learn-more-button');
      expect(button.disabled).toBe(true);
    });
  });

  describe('accessibility', () => {
    it('should have role="dialog" on panel', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();

      const panel = fixture.nativeElement.querySelector('.concept-panel');
      expect(panel.getAttribute('role')).toBe('dialog');
    });

    it('should have aria-modal="true" on panel', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();

      const panel = fixture.nativeElement.querySelector('.concept-panel');
      expect(panel.getAttribute('aria-modal')).toBe('true');
    });

    it('should have dynamic aria-label based on concept', () => {
      fixture.componentRef.setInput('isOpen', true);
      component.concept$.set(mockConceptSummary);
      fixture.detectChanges();

      const panel = fixture.nativeElement.querySelector('.concept-panel');
      expect(panel.getAttribute('aria-label')).toContain('Value-Based Pricing');
    });

    it('should have aria-label="Close panel" on close button', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();

      const closeButton = fixture.nativeElement.querySelector('.close-button');
      expect(closeButton.getAttribute('aria-label')).toBe('Close panel');
    });

    it('should have role="presentation" on backdrop', () => {
      fixture.componentRef.setInput('isOpen', true);
      fixture.detectChanges();

      const backdrop = fixture.nativeElement.querySelector('.panel-backdrop');
      expect(backdrop.getAttribute('role')).toBe('presentation');
    });
  });
});
