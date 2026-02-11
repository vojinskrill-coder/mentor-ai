import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ConfidenceIndicatorComponent } from './confidence-indicator.component';
import { ConfidenceLevel, CONFIDENCE_COLORS, type ConfidenceFactor } from '@mentor-ai/shared/types';

describe('ConfidenceIndicatorComponent', () => {
  let component: ConfidenceIndicatorComponent;
  let fixture: ComponentFixture<ConfidenceIndicatorComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConfidenceIndicatorComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ConfidenceIndicatorComponent);
    component = fixture.componentInstance;
  });

  const setInputs = (score: number, level: ConfidenceLevel) => {
    fixture.componentRef.setInput('score', score);
    fixture.componentRef.setInput('level', level);
  };

  describe('basic rendering', () => {
    it('should create', () => {
      setInputs(0.72, ConfidenceLevel.MEDIUM);
      fixture.detectChanges();
      expect(component).toBeTruthy();
    });

    it('should display correct percentage', () => {
      setInputs(0.72, ConfidenceLevel.MEDIUM);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('72%');
    });

    it('should round percentage correctly', () => {
      setInputs(0.856, ConfidenceLevel.HIGH);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      expect(compiled.textContent).toContain('86%');
    });
  });

  describe('confidence levels', () => {
    it('should display high confidence correctly', () => {
      setInputs(0.9, ConfidenceLevel.HIGH);
      fixture.detectChanges();

      expect(component.levelLabel$()).toBe('High');
      expect(component.badgeColor$()).toBe(CONFIDENCE_COLORS[ConfidenceLevel.HIGH]);
    });

    it('should display medium confidence correctly', () => {
      setInputs(0.65, ConfidenceLevel.MEDIUM);
      fixture.detectChanges();

      expect(component.levelLabel$()).toBe('Medium');
      expect(component.badgeColor$()).toBe(CONFIDENCE_COLORS[ConfidenceLevel.MEDIUM]);
    });

    it('should display low confidence correctly', () => {
      setInputs(0.35, ConfidenceLevel.LOW);
      fixture.detectChanges();

      expect(component.levelLabel$()).toBe('Low');
      expect(component.badgeColor$()).toBe(CONFIDENCE_COLORS[ConfidenceLevel.LOW]);
    });
  });

  describe('accessibility', () => {
    it('should have correct aria-label for high confidence', () => {
      setInputs(0.9, ConfidenceLevel.HIGH);
      fixture.detectChanges();

      expect(component.ariaLabel$()).toBe('AI confidence: 90 percent, high');
    });

    it('should have correct aria-label for medium confidence', () => {
      setInputs(0.72, ConfidenceLevel.MEDIUM);
      fixture.detectChanges();

      expect(component.ariaLabel$()).toBe('AI confidence: 72 percent, medium');
    });

    it('should have correct aria-label for low confidence', () => {
      setInputs(0.4, ConfidenceLevel.LOW);
      fixture.detectChanges();

      expect(component.ariaLabel$()).toBe('AI confidence: 40 percent, low');
    });

    it('should have aria-label on button', () => {
      setInputs(0.72, ConfidenceLevel.MEDIUM);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('button');
      expect(button.getAttribute('aria-label')).toBe('AI confidence: 72 percent, medium');
    });
  });

  describe('formatting', () => {
    it('should format factor names correctly', () => {
      setInputs(0.72, ConfidenceLevel.MEDIUM);
      fixture.detectChanges();

      expect(component.formatFactorName('hedging_language')).toBe('Hedging Language');
      expect(component.formatFactorName('context_depth')).toBe('Context Depth');
      expect(component.formatFactorName('response_specificity')).toBe('Response Specificity');
    });

    it('should format factor scores as percentages', () => {
      setInputs(0.72, ConfidenceLevel.MEDIUM);
      fixture.detectChanges();

      expect(component.formatFactorScore(0.85)).toBe('85%');
      expect(component.formatFactorScore(0.6)).toBe('60%');
      expect(component.formatFactorScore(0.333)).toBe('33%');
    });
  });

  describe('tooltip', () => {
    it('should show tooltip on mouse enter', () => {
      setInputs(0.72, ConfidenceLevel.MEDIUM);
      fixture.componentRef.setInput('factors', [
        { name: 'hedging_language', score: 0.85, weight: 0.35 },
      ] as ConfidenceFactor[]);
      fixture.detectChanges();

      // Initially tooltip should not be visible
      expect(fixture.nativeElement.querySelector('#confidence-tooltip')).toBeNull();

      // Simulate mouse enter
      const container = fixture.nativeElement.querySelector('div');
      container.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      // Tooltip should now be visible
      expect(fixture.nativeElement.querySelector('#confidence-tooltip')).toBeTruthy();
    });

    it('should hide tooltip on mouse leave', () => {
      setInputs(0.72, ConfidenceLevel.MEDIUM);
      fixture.componentRef.setInput('factors', [
        { name: 'hedging_language', score: 0.85, weight: 0.35 },
      ] as ConfidenceFactor[]);
      fixture.detectChanges();

      // Show tooltip
      const container = fixture.nativeElement.querySelector('div');
      container.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('#confidence-tooltip')).toBeTruthy();

      // Hide tooltip
      container.dispatchEvent(new MouseEvent('mouseleave'));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('#confidence-tooltip')).toBeNull();
    });

    it('should display improvement suggestion in tooltip', () => {
      setInputs(0.55, ConfidenceLevel.MEDIUM);
      fixture.componentRef.setInput('improvementSuggestion', 'Provide more context for better results.');
      fixture.detectChanges();

      // Show tooltip
      const container = fixture.nativeElement.querySelector('div');
      container.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      const tooltip = fixture.nativeElement.querySelector('#confidence-tooltip');
      expect(tooltip.textContent).toContain('To improve:');
      expect(tooltip.textContent).toContain('Provide more context for better results.');
    });

    it('should display factor breakdown in tooltip', () => {
      setInputs(0.72, ConfidenceLevel.MEDIUM);
      fixture.componentRef.setInput('factors', [
        { name: 'hedging_language', score: 0.85, weight: 0.35 },
        { name: 'context_depth', score: 0.6, weight: 0.35 },
      ] as ConfidenceFactor[]);
      fixture.detectChanges();

      // Show tooltip
      const container = fixture.nativeElement.querySelector('div');
      container.dispatchEvent(new MouseEvent('mouseenter'));
      fixture.detectChanges();

      const tooltip = fixture.nativeElement.querySelector('#confidence-tooltip');
      expect(tooltip.textContent).toContain('Hedging Language');
      expect(tooltip.textContent).toContain('85%');
      expect(tooltip.textContent).toContain('Context Depth');
      expect(tooltip.textContent).toContain('60%');
    });
  });

  describe('computed properties', () => {
    it('should compute badge background color with opacity', () => {
      setInputs(0.9, ConfidenceLevel.HIGH);
      fixture.detectChanges();

      const bgColor = component.badgeBackgroundColor$();
      expect(bgColor).toContain('rgba');
      expect(bgColor).toContain('0.2');
    });

    it('should update when score changes', () => {
      setInputs(0.72, ConfidenceLevel.MEDIUM);
      fixture.detectChanges();
      expect(component.percentageDisplay$()).toBe('72%');

      fixture.componentRef.setInput('score', 0.85);
      fixture.detectChanges();
      expect(component.percentageDisplay$()).toBe('85%');
    });
  });
});
