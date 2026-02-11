import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { LlmConfigComponent } from './llm-config.component';
import { LlmConfigService } from '../services/llm-config.service';
import { LlmProviderType } from '@mentor-ai/shared/types';

describe('LlmConfigComponent', () => {
  let component: LlmConfigComponent;
  let fixture: ComponentFixture<LlmConfigComponent>;
  let mockLlmConfigService: {
    getConfig: ReturnType<typeof vi.fn>;
    updateConfig: ReturnType<typeof vi.fn>;
    validateProvider: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockLlmConfigService = {
      getConfig: vi.fn().mockReturnValue(of({
        data: {
          primaryProvider: null,
          fallbackProvider: null,
        },
      })),
      updateConfig: vi.fn(),
      validateProvider: vi.fn(),
    };

    await TestBed.configureTestingModule({
      imports: [LlmConfigComponent],
      providers: [
        provideRouter([]),
        { provide: LlmConfigService, useValue: mockLlmConfigService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(LlmConfigComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should load config on init', () => {
    fixture.detectChanges();
    expect(mockLlmConfigService.getConfig).toHaveBeenCalled();
  });

  it('should set loading state while fetching config', () => {
    expect(component.isLoading$()).toBe(true);
    fixture.detectChanges();
    expect(component.isLoading$()).toBe(false);
  });

  it('should display existing config when loaded', () => {
    mockLlmConfigService.getConfig.mockReturnValue(of({
      data: {
        primaryProvider: {
          id: 'cfg_1',
          providerType: LlmProviderType.OPENROUTER,
          apiKey: '***masked***',
          modelId: 'meta-llama/llama-3.1-70b',
          isPrimary: true,
          isFallback: false,
          isActive: true,
          createdAt: '2026-02-04T00:00:00.000Z',
          updatedAt: '2026-02-04T00:00:00.000Z',
        },
        fallbackProvider: null,
      },
    }));

    fixture.detectChanges();

    expect(component.primaryProviderType$()).toBe(LlmProviderType.OPENROUTER);
    expect(component.primaryModelId).toBe('meta-llama/llama-3.1-70b');
  });

  describe('selectPrimaryProvider', () => {
    it('should update primary provider type', () => {
      fixture.detectChanges();
      component.selectPrimaryProvider(LlmProviderType.LOCAL_LLAMA);

      expect(component.primaryProviderType$()).toBe(LlmProviderType.LOCAL_LLAMA);
      expect(component.primaryValidation$()).toBeNull();
      expect(component.primaryModelId).toBe('');
    });
  });

  describe('validatePrimaryProvider', () => {
    it('should validate OpenRouter provider', () => {
      fixture.detectChanges();
      component.primaryProviderType$.set(LlmProviderType.OPENROUTER);
      component.primaryApiKey = 'sk-or-test';

      mockLlmConfigService.validateProvider.mockReturnValue(of({
        data: {
          valid: true,
          models: [
            { id: 'meta-llama/llama-3.1-70b', name: 'Llama 3.1 70B', costPer1kTokens: 0.0009 },
          ],
          resourceInfo: null,
        },
      }));

      component.validatePrimaryProvider();
      fixture.detectChanges();

      expect(mockLlmConfigService.validateProvider).toHaveBeenCalledWith(
        LlmProviderType.OPENROUTER,
        'sk-or-test',
        undefined
      );
      expect(component.primaryValidation$()?.valid).toBe(true);
      expect(component.primaryModelId).toBe('meta-llama/llama-3.1-70b');
    });

    it('should validate Local Llama provider', () => {
      fixture.detectChanges();
      component.primaryProviderType$.set(LlmProviderType.LOCAL_LLAMA);
      component.primaryEndpoint = 'http://localhost:11434';

      mockLlmConfigService.validateProvider.mockReturnValue(of({
        data: {
          valid: true,
          models: [
            { id: 'llama3.1:8b', name: 'Llama 3.1 8B', costPer1kTokens: null },
          ],
          resourceInfo: {
            gpuRequired: true,
            gpuMemoryGb: 8,
            cpuCores: 4,
            ramGb: 16,
          },
        },
      }));

      component.validatePrimaryProvider();
      fixture.detectChanges();

      expect(mockLlmConfigService.validateProvider).toHaveBeenCalledWith(
        LlmProviderType.LOCAL_LLAMA,
        undefined,
        'http://localhost:11434'
      );
      expect(component.primaryValidation$()?.resourceInfo).not.toBeNull();
    });

    it('should handle validation error', () => {
      fixture.detectChanges();
      component.primaryProviderType$.set(LlmProviderType.OPENROUTER);
      component.primaryApiKey = 'invalid-key';

      mockLlmConfigService.validateProvider.mockReturnValue(
        throwError(() => new Error('Invalid API key'))
      );

      component.validatePrimaryProvider();
      fixture.detectChanges();

      expect(component.primaryValidation$()?.valid).toBe(false);
      expect(component.primaryValidation$()?.errorMessage).toBe('Invalid API key');
    });
  });

  describe('canSave', () => {
    beforeEach(() => {
      fixture.detectChanges();
    });

    it('should return false when no model selected', () => {
      component.primaryModelId = '';
      expect(component.canSave()).toBe(false);
    });

    it('should return false for OpenRouter without API key', () => {
      component.primaryProviderType$.set(LlmProviderType.OPENROUTER);
      component.primaryModelId = 'test-model';
      component.primaryApiKey = '';
      expect(component.canSave()).toBe(false);
    });

    it('should return true for OpenRouter with API key and model', () => {
      component.primaryProviderType$.set(LlmProviderType.OPENROUTER);
      component.primaryModelId = 'test-model';
      component.primaryApiKey = 'sk-or-test';
      expect(component.canSave()).toBe(true);
    });

    it('should return true for Local Llama with model', () => {
      component.primaryProviderType$.set(LlmProviderType.LOCAL_LLAMA);
      component.primaryModelId = 'llama3.1:8b';
      expect(component.canSave()).toBe(true);
    });

    it('should return false for fallback without model', () => {
      component.primaryProviderType$.set(LlmProviderType.LOCAL_LLAMA);
      component.primaryModelId = 'llama3.1:8b';
      component.hasFallback = true;
      component.fallbackModelId = '';
      expect(component.canSave()).toBe(false);
    });
  });

  describe('saveConfiguration', () => {
    it('should save configuration successfully', () => {
      fixture.detectChanges();
      component.primaryProviderType$.set(LlmProviderType.OPENROUTER);
      component.primaryApiKey = 'sk-or-test';
      component.primaryModelId = 'meta-llama/llama-3.1-70b';

      mockLlmConfigService.updateConfig.mockReturnValue(of({
        data: {
          primaryProvider: {
            id: 'cfg_new',
            providerType: LlmProviderType.OPENROUTER,
            modelId: 'meta-llama/llama-3.1-70b',
          },
          fallbackProvider: null,
        },
        message: 'Configuration saved successfully',
      }));

      component.saveConfiguration();
      fixture.detectChanges();

      expect(mockLlmConfigService.updateConfig).toHaveBeenCalled();
      expect(component.successMessage$()).toBe('Configuration saved successfully');
    });

    it('should handle save error', () => {
      fixture.detectChanges();
      component.primaryProviderType$.set(LlmProviderType.OPENROUTER);
      component.primaryApiKey = 'sk-or-test';
      component.primaryModelId = 'meta-llama/llama-3.1-70b';

      mockLlmConfigService.updateConfig.mockReturnValue(
        throwError(() => new Error('Failed to save'))
      );

      component.saveConfiguration();
      fixture.detectChanges();

      expect(component.errorMessage$()).toBe('Failed to save');
      expect(component.isSaving$()).toBe(false);
    });
  });
});
