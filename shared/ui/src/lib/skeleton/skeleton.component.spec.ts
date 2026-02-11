import { ComponentFixture, TestBed } from '@angular/core/testing';
import {
  SkeletonComponent,
  SkeletonTextComponent,
  SkeletonAvatarComponent,
  SkeletonCardComponent,
  SkeletonListItemComponent,
  SkeletonVariant,
} from './skeleton.component';

describe('SkeletonComponent', () => {
  let component: SkeletonComponent;
  let fixture: ComponentFixture<SkeletonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('variants', () => {
    const variants: SkeletonVariant[] = ['text', 'circle', 'rectangle'];

    variants.forEach((variant) => {
      it(`should apply ${variant} variant classes`, () => {
        fixture.componentRef.setInput('variant', variant);
        fixture.detectChanges();

        const classes = component.skeletonClasses();
        if (variant === 'circle') {
          expect(classes).toContain('rounded-full');
          expect(classes).toContain('aspect-square');
        } else if (variant === 'text') {
          expect(classes).toContain('h-4');
        }
      });
    });
  });

  describe('animation', () => {
    it('should have pulse animation class', () => {
      const classes = component.skeletonClasses();
      expect(classes).toContain('animate-pulse');
    });
  });

  describe('styling', () => {
    it('should have muted background', () => {
      const classes = component.skeletonClasses();
      expect(classes).toContain('bg-muted');
    });

    it('should be rounded by default for rectangle variant', () => {
      fixture.componentRef.setInput('variant', 'rectangle');
      fixture.detectChanges();

      const classes = component.skeletonClasses();
      expect(classes).toContain('rounded-md');
    });

    it('should not be rounded when rounded is false', () => {
      fixture.componentRef.setInput('variant', 'rectangle');
      fixture.componentRef.setInput('rounded', false);
      fixture.detectChanges();

      const classes = component.skeletonClasses();
      expect(classes).not.toContain('rounded-md');
    });
  });

  describe('dimensions', () => {
    it('should apply custom width', () => {
      fixture.componentRef.setInput('width', '200px');
      fixture.detectChanges();

      const skeleton = fixture.nativeElement.querySelector('div');
      expect(skeleton.style.width).toBe('200px');
    });

    it('should apply custom height', () => {
      fixture.componentRef.setInput('height', '50px');
      fixture.detectChanges();

      const skeleton = fixture.nativeElement.querySelector('div');
      expect(skeleton.style.height).toBe('50px');
    });
  });

  describe('accessibility', () => {
    it('should have role="status"', () => {
      const skeleton = fixture.nativeElement.querySelector('div');
      expect(skeleton.getAttribute('role')).toBe('status');
    });

    it('should have aria-label for screen readers', () => {
      const skeleton = fixture.nativeElement.querySelector('div');
      expect(skeleton.getAttribute('aria-label')).toBe('Loading...');
    });

    it('should have screen reader only text', () => {
      const srOnly = fixture.nativeElement.querySelector('.sr-only');
      expect(srOnly).toBeTruthy();
      expect(srOnly.textContent).toBe('Loading...');
    });
  });
});

describe('SkeletonTextComponent', () => {
  let fixture: ComponentFixture<SkeletonTextComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonTextComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonTextComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render skeleton with text variant', () => {
    const skeleton = fixture.nativeElement.querySelector('ui-skeleton');
    expect(skeleton).toBeTruthy();
  });
});

describe('SkeletonAvatarComponent', () => {
  let fixture: ComponentFixture<SkeletonAvatarComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonAvatarComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonAvatarComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render skeleton with circle variant', () => {
    const skeleton = fixture.nativeElement.querySelector('ui-skeleton');
    expect(skeleton).toBeTruthy();
  });
});

describe('SkeletonCardComponent', () => {
  let fixture: ComponentFixture<SkeletonCardComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonCardComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonCardComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render multiple skeleton elements', () => {
    const skeletons = fixture.nativeElement.querySelectorAll('ui-skeleton');
    expect(skeletons.length).toBeGreaterThan(1);
  });
});

describe('SkeletonListItemComponent', () => {
  let fixture: ComponentFixture<SkeletonListItemComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SkeletonListItemComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(SkeletonListItemComponent);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should render avatar and text skeletons', () => {
    const skeletons = fixture.nativeElement.querySelectorAll('ui-skeleton');
    expect(skeletons.length).toBe(3); // 1 circle + 2 text
  });
});
