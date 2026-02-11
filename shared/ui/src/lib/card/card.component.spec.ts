import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { vi } from 'vitest';
import {
  CardComponent,
  CardHeaderComponent,
  CardTitleComponent,
  CardDescriptionComponent,
  CardContentComponent,
  CardFooterComponent,
} from './card.component';

@Component({
  standalone: true,
  imports: [
    CardComponent,
    CardHeaderComponent,
    CardTitleComponent,
    CardDescriptionComponent,
    CardContentComponent,
    CardFooterComponent,
  ],
  template: `
    <ui-card>
      <ui-card-header>
        <ui-card-title>Test Title</ui-card-title>
        <ui-card-description>Test Description</ui-card-description>
      </ui-card-header>
      <ui-card-content>
        <p>Test Content</p>
      </ui-card-content>
      <ui-card-footer>
        <p>Test Footer</p>
      </ui-card-footer>
    </ui-card>
  `,
})
class TestHostComponent {}

describe('CardComponent', () => {
  let component: CardComponent;
  let fixture: ComponentFixture<CardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('base styles', () => {
    it('should have base card classes', () => {
      const classes = component.cardClasses();
      expect(classes).toContain('rounded-lg');
      expect(classes).toContain('border');
      expect(classes).toContain('bg-card');
      expect(classes).toContain('shadow-sm');
    });
  });

  describe('clickable behavior', () => {
    it('should not have button role by default', () => {
      const card = fixture.nativeElement.querySelector('div');
      expect(card.getAttribute('role')).toBeNull();
    });

    it('should have button role when clickable', () => {
      fixture.componentRef.setInput('clickable', true);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('div');
      expect(card.getAttribute('role')).toBe('button');
    });

    it('should be focusable when clickable', () => {
      fixture.componentRef.setInput('clickable', true);
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('div');
      expect(card.getAttribute('tabindex')).toBe('0');
    });

    it('should have hover and focus styles when clickable', () => {
      fixture.componentRef.setInput('clickable', true);
      fixture.detectChanges();

      const classes = component.cardClasses();
      expect(classes).toContain('cursor-pointer');
      expect(classes).toContain('hover:bg-secondary/50');
      expect(classes).toContain('focus-visible:ring-2');
    });

    it('should emit cardClick on click when clickable', () => {
      fixture.componentRef.setInput('clickable', true);
      fixture.detectChanges();

      const clickSpy = vi.fn();
      component.cardClick.subscribe(clickSpy);

      const card = fixture.nativeElement.querySelector('div');
      card.click();

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should not emit cardClick on click when not clickable', () => {
      const clickSpy = vi.fn();
      component.cardClick.subscribe(clickSpy);

      const card = fixture.nativeElement.querySelector('div');
      card.click();

      expect(clickSpy).not.toHaveBeenCalled();
    });
  });

  describe('selected state', () => {
    it('should have ring styles when selected', () => {
      fixture.componentRef.setInput('selected', true);
      fixture.detectChanges();

      const classes = component.cardClasses();
      expect(classes).toContain('ring-2');
      expect(classes).toContain('ring-primary');
    });
  });

  describe('keyboard navigation', () => {
    it('should handle Enter key when clickable', () => {
      fixture.componentRef.setInput('clickable', true);
      fixture.detectChanges();

      const clickSpy = vi.fn();
      component.cardClick.subscribe(clickSpy);

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      component.handleKeydown(event);

      expect(clickSpy).toHaveBeenCalled();
    });

    it('should handle Space key when clickable', () => {
      fixture.componentRef.setInput('clickable', true);
      fixture.detectChanges();

      const clickSpy = vi.fn();
      component.cardClick.subscribe(clickSpy);

      const event = new KeyboardEvent('keydown', { key: ' ' });
      component.handleKeydown(event);

      expect(clickSpy).toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should support aria-label', () => {
      fixture.componentRef.setInput('ariaLabel', 'Feature card');
      fixture.detectChanges();

      const card = fixture.nativeElement.querySelector('div');
      expect(card.getAttribute('aria-label')).toBe('Feature card');
    });
  });
});

describe('Card subcomponents', () => {
  let fixture: ComponentFixture<TestHostComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TestHostComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(TestHostComponent);
    fixture.detectChanges();
  });

  it('should render card with all sections', () => {
    const card = fixture.nativeElement.querySelector('ui-card');
    expect(card).toBeTruthy();

    const header = fixture.nativeElement.querySelector('ui-card-header');
    expect(header).toBeTruthy();

    const title = fixture.nativeElement.querySelector('ui-card-title');
    expect(title.textContent).toContain('Test Title');

    const description = fixture.nativeElement.querySelector('ui-card-description');
    expect(description.textContent).toContain('Test Description');

    const content = fixture.nativeElement.querySelector('ui-card-content');
    expect(content.textContent).toContain('Test Content');

    const footer = fixture.nativeElement.querySelector('ui-card-footer');
    expect(footer.textContent).toContain('Test Footer');
  });
});
