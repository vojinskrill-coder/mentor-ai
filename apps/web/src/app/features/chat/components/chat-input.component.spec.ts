import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatInputComponent } from './chat-input.component';

describe('ChatInputComponent', () => {
  let component: ChatInputComponent;
  let fixture: ComponentFixture<ChatInputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatInputComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ChatInputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have empty input initially', () => {
    expect(component.inputValue).toBe('');
  });

  describe('send', () => {
    it('should emit messageSent when input has value', () => {
      const emitSpy = vi.spyOn(component.messageSent, 'emit');
      component.inputValue = 'Hello world';

      component.send();

      expect(emitSpy).toHaveBeenCalledWith('Hello world');
      expect(component.inputValue).toBe('');
    });

    it('should not emit when input is empty', () => {
      const emitSpy = vi.spyOn(component.messageSent, 'emit');
      component.inputValue = '';

      component.send();

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should not emit when input is only whitespace', () => {
      const emitSpy = vi.spyOn(component.messageSent, 'emit');
      component.inputValue = '   ';

      component.send();

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should not emit when disabled', () => {
      const emitSpy = vi.spyOn(component.messageSent, 'emit');
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();
      component.inputValue = 'Hello';

      component.send();

      expect(emitSpy).not.toHaveBeenCalled();
    });

    it('should trim whitespace from message', () => {
      const emitSpy = vi.spyOn(component.messageSent, 'emit');
      component.inputValue = '  Hello world  ';

      component.send();

      expect(emitSpy).toHaveBeenCalledWith('Hello world');
    });
  });

  describe('handleKeydown', () => {
    it('should send on Enter key', () => {
      const sendSpy = vi.spyOn(component, 'send');
      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      component.handleKeydown(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
      expect(sendSpy).toHaveBeenCalled();
    });

    it('should not send on Shift+Enter', () => {
      const sendSpy = vi.spyOn(component, 'send');
      const event = new KeyboardEvent('keydown', {
        key: 'Enter',
        shiftKey: true,
      });

      component.handleKeydown(event);

      expect(sendSpy).not.toHaveBeenCalled();
    });

    it('should not send on other keys', () => {
      const sendSpy = vi.spyOn(component, 'send');
      const event = new KeyboardEvent('keydown', { key: 'a' });

      component.handleKeydown(event);

      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe('disabled state', () => {
    it('should disable textarea when disabled', async () => {
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const textarea = fixture.nativeElement.querySelector('textarea');
      expect(textarea.disabled).toBe(true);
    });

    it('should disable send button when disabled', () => {
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('button');
      expect(button.disabled).toBe(true);
    });

    it('should show spinner when disabled', () => {
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();

      const spinner = fixture.nativeElement.querySelector('.animate-spin');
      expect(spinner).toBeTruthy();
    });
  });
});
