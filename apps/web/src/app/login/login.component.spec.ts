import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from '../core/auth/auth.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let mockAuthService: {
    login: ReturnType<typeof vi.fn>;
    devLogin: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  beforeEach(async () => {
    mockAuthService = {
      login: vi.fn(),
      devLogin: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: mockAuthService }],
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should render brand heading', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.brand h1')?.textContent).toContain('Welcome to Mentor AI');
  });

  it('should initialize with loading false and no error', () => {
    expect(component.isLoading()).toBe(false);
    expect(component.error()).toBeNull();
  });

  describe('signInWithGoogle', () => {
    it('should set loading state and call auth login', () => {
      component.signInWithGoogle();

      expect(component.isLoading()).toBe(true);
      expect(component.error()).toBeNull();
      expect(mockAuthService.login).toHaveBeenCalledTimes(1);
    });

    it('should clear previous error on sign in', () => {
      component.error.set('Previous error');

      component.signInWithGoogle();

      expect(component.error()).toBeNull();
    });

    it('should disable button when loading', () => {
      fixture.detectChanges();
      component.isLoading.set(true);
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const googleBtn = compiled.querySelector('.google-btn') as HTMLButtonElement;
      expect(googleBtn.disabled).toBe(true);
    });
  });

  describe('devLogin', () => {
    it('should call devLogin and navigate to chat', () => {
      component.devLogin();

      expect(mockAuthService.devLogin).toHaveBeenCalledTimes(1);
      expect(router.navigate).toHaveBeenCalledWith(['/chat']);
    });
  });

  describe('error display', () => {
    it('should show error box when error is set', () => {
      component.error.set('Authentication failed');
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const errorBox = compiled.querySelector('.error-box');
      expect(errorBox).toBeTruthy();
      expect(errorBox?.textContent).toContain('Authentication failed');
    });

    it('should not show error box when error is null', () => {
      fixture.detectChanges();

      const compiled = fixture.nativeElement as HTMLElement;
      const errorBox = compiled.querySelector('.error-box');
      expect(errorBox).toBeFalsy();
    });
  });

  it('should render register link', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const registerLink = compiled.querySelector('.footer a');
    expect(registerLink?.textContent).toContain('Create workspace');
  });
});
