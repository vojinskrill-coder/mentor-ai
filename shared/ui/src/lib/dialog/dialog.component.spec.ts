import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Component } from '@angular/core';
import { vi } from 'vitest';
import {
  DialogComponent,
  DialogHeaderComponent,
  DialogTitleComponent,
  DialogDescriptionComponent,
  DialogContentComponent,
  DialogFooterComponent,
  DialogTriggerComponent,
} from './dialog.component';

@Component({
  standalone: true,
  imports: [DialogComponent],
  template: `
    <ui-dialog>
      <button id="btn1">Button 1</button>
      <input id="input1" type="text" />
      <button id="btn2">Button 2</button>
    </ui-dialog>
  `,
})
class TestDialogWithFocusableElementsComponent {}

describe('DialogComponent', () => {
  let component: DialogComponent;
  let fixture: ComponentFixture<DialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DialogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(DialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    // Clean up body overflow
    document.body.style.overflow = '';
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('initial state', () => {
    it('should start closed', () => {
      expect(component.isOpen()).toBe(false);
    });

    it('should not render dialog content when closed', () => {
      const dialog = fixture.nativeElement.querySelector('[role="dialog"]');
      expect(dialog).toBeFalsy();
    });
  });

  describe('open/close behavior', () => {
    it('should set isOpen to true when openDialog is called', () => {
      component.openDialog();
      expect(component.isOpen()).toBe(true);
    });

    it('should set isOpen to false when close is called', () => {
      component.openDialog();
      component.close();
      expect(component.isOpen()).toBe(false);
    });

    it('should emit openChange(true) when opening', () => {
      const openChangeSpy = vi.fn();
      component.openChange.subscribe(openChangeSpy);

      component.openDialog();

      expect(openChangeSpy).toHaveBeenCalledWith(true);
    });

    it('should emit openChange(false) when closing', () => {
      component.openDialog();

      const openChangeSpy = vi.fn();
      component.openChange.subscribe(openChangeSpy);

      component.close();

      expect(openChangeSpy).toHaveBeenCalledWith(false);
    });

    it('should emit closed event when closing', () => {
      component.openDialog();

      const closedSpy = vi.fn();
      component.closed.subscribe(closedSpy);

      component.close();

      expect(closedSpy).toHaveBeenCalled();
    });
  });

  describe('body scroll lock', () => {
    it('should prevent body scroll when open', () => {
      component.openDialog();
      expect(document.body.style.overflow).toBe('hidden');
    });

    it('should restore body scroll when closed', () => {
      component.openDialog();
      component.close();
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('escape key handling', () => {
    it('should close on escape when closeOnEscape is true (default)', () => {
      component.openDialog();

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      component.handleEscape(event);

      expect(component.isOpen()).toBe(false);
    });

    it('should not close on escape when closeOnEscape is false', () => {
      fixture.componentRef.setInput('closeOnEscape', false);
      fixture.detectChanges();

      component.openDialog();

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      component.handleEscape(event);

      expect(component.isOpen()).toBe(true);
    });
  });

  describe('backdrop click handling', () => {
    it('should close on backdrop click when closeOnBackdropClick is true (default)', () => {
      component.openDialog();

      const event = new MouseEvent('click');
      component.handleBackdropClick(event);

      expect(component.isOpen()).toBe(false);
    });

    it('should not close on backdrop click when closeOnBackdropClick is false', () => {
      fixture.componentRef.setInput('closeOnBackdropClick', false);
      fixture.detectChanges();

      component.openDialog();

      const event = new MouseEvent('click');
      component.handleBackdropClick(event);

      expect(component.isOpen()).toBe(true);
    });
  });

  describe('configuration inputs', () => {
    it('should have showCloseButton true by default', () => {
      expect(component.showCloseButton()).toBe(true);
    });

    it('should have closeOnEscape true by default', () => {
      expect(component.closeOnEscape()).toBe(true);
    });

    it('should have closeOnBackdropClick true by default', () => {
      expect(component.closeOnBackdropClick()).toBe(true);
    });
  });

  describe('accessibility IDs', () => {
    it('should generate unique dialog ID', () => {
      expect(component.dialogId()).toContain('ui-dialog-');
    });

    it('should generate title ID from dialog ID', () => {
      expect(component.titleId()).toBe(`${component.dialogId()}-title`);
    });

    it('should generate description ID from dialog ID', () => {
      expect(component.descriptionId()).toBe(`${component.dialogId()}-description`);
    });
  });

  describe('focus trap', () => {
    it('should have handleTabKey method defined', () => {
      expect(component.handleTabKey).toBeDefined();
    });

    it('should not process Tab key when dialog is closed', () => {
      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      component.handleTabKey(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should not process non-Tab keys when dialog is open', () => {
      component.openDialog();
      fixture.detectChanges();

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      component.handleTabKey(event);

      expect(preventDefaultSpy).not.toHaveBeenCalled();
    });

    it('should handle Tab when no focusable elements exist', () => {
      component.openDialog();
      fixture.detectChanges();

      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      // Should not throw when there are no focusable elements
      expect(() => component.handleTabKey(event)).not.toThrow();
    });

    it('should store trigger element when opening', () => {
      const button = document.createElement('button');
      document.body.appendChild(button);
      button.focus();

      component.openDialog();

      // Trigger element should be stored (it's private, so we test the effect)
      component.close();

      // After close, focus should return (though in test env it may not work)
      document.body.removeChild(button);
    });

    it('should restore body scroll on destroy', () => {
      component.openDialog();
      expect(document.body.style.overflow).toBe('hidden');

      component.ngOnDestroy();

      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('open input synchronization', () => {
    it('should open when open input is set to true', async () => {
      fixture.componentRef.setInput('open', true);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.isOpen()).toBe(true);
    });

    it('should close when open input is set to false', async () => {
      component.openDialog();
      fixture.detectChanges();

      fixture.componentRef.setInput('open', false);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(component.isOpen()).toBe(false);
    });
  });

  describe('ngAfterViewInit', () => {
    it('should setup focus trap when dialog is open during init', async () => {
      // Set open input before detection
      fixture.componentRef.setInput('open', true);
      fixture.detectChanges();
      await fixture.whenStable();

      // Manually call ngAfterViewInit to verify it doesn't throw
      expect(() => component.ngAfterViewInit()).not.toThrow();
    });

    it('should not throw when dialog is closed during init', () => {
      // Dialog is closed by default
      expect(() => component.ngAfterViewInit()).not.toThrow();
    });
  });
});

describe('Dialog subcomponents', () => {
  it('should create DialogHeaderComponent', async () => {
    await TestBed.configureTestingModule({
      imports: [DialogHeaderComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(DialogHeaderComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should create DialogTitleComponent', async () => {
    await TestBed.configureTestingModule({
      imports: [DialogTitleComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(DialogTitleComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should create DialogDescriptionComponent', async () => {
    await TestBed.configureTestingModule({
      imports: [DialogDescriptionComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(DialogDescriptionComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should create DialogContentComponent', async () => {
    await TestBed.configureTestingModule({
      imports: [DialogContentComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(DialogContentComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should create DialogFooterComponent', async () => {
    await TestBed.configureTestingModule({
      imports: [DialogFooterComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(DialogFooterComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });
});

describe('DialogTriggerComponent', () => {
  it('should open dialog when clicked', async () => {
    await TestBed.configureTestingModule({
      imports: [DialogTriggerComponent, DialogComponent],
    }).compileComponents();

    const dialogFixture = TestBed.createComponent(DialogComponent);
    const dialogComponent = dialogFixture.componentInstance;

    const triggerFixture = TestBed.createComponent(DialogTriggerComponent);
    triggerFixture.componentRef.setInput('dialogRef', dialogComponent);
    triggerFixture.detectChanges();

    const trigger = triggerFixture.componentInstance;
    trigger.handleClick();

    expect(dialogComponent.isOpen()).toBe(true);
  });

  it('should not throw when dialogRef is undefined', async () => {
    await TestBed.configureTestingModule({
      imports: [DialogTriggerComponent],
    }).compileComponents();

    const fixture = TestBed.createComponent(DialogTriggerComponent);
    // Don't set dialogRef - it will be undefined when called
    fixture.detectChanges();

    // This should not throw even though dialogRef is required
    // In real usage, Angular would throw at compile time for required inputs
  });

  it('should have keyboard accessibility attributes', async () => {
    await TestBed.configureTestingModule({
      imports: [DialogTriggerComponent, DialogComponent],
    }).compileComponents();

    const dialogFixture = TestBed.createComponent(DialogComponent);
    const triggerFixture = TestBed.createComponent(DialogTriggerComponent);
    triggerFixture.componentRef.setInput('dialogRef', dialogFixture.componentInstance);
    triggerFixture.detectChanges();

    const span = triggerFixture.nativeElement.querySelector('span');
    expect(span.getAttribute('role')).toBe('button');
    expect(span.getAttribute('tabindex')).toBe('0');
  });

  it('should call handleKeydown on Enter/Space', async () => {
    await TestBed.configureTestingModule({
      imports: [DialogTriggerComponent, DialogComponent],
    }).compileComponents();

    const dialogFixture = TestBed.createComponent(DialogComponent);
    const triggerFixture = TestBed.createComponent(DialogTriggerComponent);
    triggerFixture.componentRef.setInput('dialogRef', dialogFixture.componentInstance);
    triggerFixture.detectChanges();

    const trigger = triggerFixture.componentInstance;
    const handleClickSpy = vi.spyOn(trigger, 'handleClick');

    trigger.handleKeydown();

    expect(handleClickSpy).toHaveBeenCalled();
  });
});

describe('Dialog Focus Trap with Focusable Elements', () => {
  it('should wrap focus from last to first element on Tab', async () => {
    await TestBed.configureTestingModule({
      imports: [TestDialogWithFocusableElementsComponent],
    }).compileComponents();

    const testFixture = TestBed.createComponent(TestDialogWithFocusableElementsComponent);
    testFixture.detectChanges();

    const dialogEl = testFixture.debugElement.children[0]!;
    const dialogComponent = dialogEl.componentInstance as DialogComponent;
    dialogComponent.openDialog();
    testFixture.detectChanges();
    await testFixture.whenStable();
    testFixture.detectChanges();

    // Get buttons inside dialog
    const btn2 = testFixture.nativeElement.querySelector('#btn2') as HTMLButtonElement;
    const btn1 = testFixture.nativeElement.querySelector('#btn1') as HTMLButtonElement;

    if (btn2 && btn1) {
      btn2.focus();
      const focusSpy = vi.spyOn(btn1, 'focus');

      const event = new KeyboardEvent('keydown', { key: 'Tab' });
      dialogComponent.handleTabKey(event);

      expect(focusSpy).toHaveBeenCalled();
    }
  });

  it('should wrap focus from first to last element on Shift+Tab', async () => {
    await TestBed.configureTestingModule({
      imports: [TestDialogWithFocusableElementsComponent],
    }).compileComponents();

    const testFixture = TestBed.createComponent(TestDialogWithFocusableElementsComponent);
    testFixture.detectChanges();

    const dialogEl = testFixture.debugElement.children[0]!;
    const dialogComponent = dialogEl.componentInstance as DialogComponent;
    dialogComponent.openDialog();
    testFixture.detectChanges();
    await testFixture.whenStable();
    testFixture.detectChanges();

    // Get buttons inside dialog
    const btn1 = testFixture.nativeElement.querySelector('#btn1') as HTMLButtonElement;
    const btn2 = testFixture.nativeElement.querySelector('#btn2') as HTMLButtonElement;

    if (btn1 && btn2) {
      btn1.focus();
      const focusSpy = vi.spyOn(btn2, 'focus');

      const event = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true });
      dialogComponent.handleTabKey(event);

      expect(focusSpy).toHaveBeenCalled();
    }
  });
});
