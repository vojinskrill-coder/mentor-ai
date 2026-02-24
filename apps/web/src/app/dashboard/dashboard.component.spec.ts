import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { DashboardComponent } from './dashboard.component';
import { AuthService } from '../core/auth/auth.service';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let mockAuthService: {
    logout: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockAuthService = {
      logout: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [DashboardComponent],
      providers: [provideRouter([]), { provide: AuthService, useValue: mockAuthService }],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should render welcome heading', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('.welcome-card h2')?.textContent).toContain(
      'Welcome to Mentor AI'
    );
  });

  it('should render navigation links', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const navLinks = compiled.querySelectorAll('.nav-links a');
    expect(navLinks.length).toBe(3);
    expect(navLinks[0]!.textContent).toContain('Chat');
    expect(navLinks[1]!.textContent).toContain('Team');
    expect(navLinks[2]!.textContent).toContain('Settings');
  });

  it('should render persona grid with 6 personas', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const personas = compiled.querySelectorAll('.persona-card');
    expect(personas.length).toBe(6);
  });

  it('should render admin section with 4 cards', () => {
    fixture.detectChanges();
    const compiled = fixture.nativeElement as HTMLElement;
    const adminCards = compiled.querySelectorAll('.admin-card');
    expect(adminCards.length).toBe(4);
  });

  describe('logout', () => {
    it('should call AuthService.logout when logout button clicked', () => {
      fixture.detectChanges();
      component.logout();
      expect(mockAuthService.logout).toHaveBeenCalledTimes(1);
    });

    it('should trigger logout on button click', () => {
      fixture.detectChanges();
      const compiled = fixture.nativeElement as HTMLElement;
      const logoutBtn = compiled.querySelector('.logout-btn') as HTMLButtonElement;
      logoutBtn.click();
      expect(mockAuthService.logout).toHaveBeenCalledTimes(1);
    });
  });
});
