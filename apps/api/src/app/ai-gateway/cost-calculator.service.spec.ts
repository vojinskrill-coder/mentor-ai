import { Test, TestingModule } from '@nestjs/testing';
import { CostCalculatorService } from './cost-calculator.service';

describe('CostCalculatorService', () => {
  let service: CostCalculatorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CostCalculatorService],
    }).compile();

    service = module.get<CostCalculatorService>(CostCalculatorService);
  });

  describe('calculateCost', () => {
    it('should calculate cost for known model', () => {
      const result = service.calculateCost(
        'openai/gpt-4-turbo',
        1000, // input tokens
        500 // output tokens
      );

      // GPT-4-Turbo: $0.01/1K input, $0.03/1K output
      // Expected: (1000/1000 * 0.01) + (500/1000 * 0.03) = 0.01 + 0.015 = 0.025
      expect(result.inputCost).toBe(0.01);
      expect(result.outputCost).toBe(0.015);
      expect(result.totalCost).toBe(0.025);
      expect(result.pricingFound).toBe(true);
    });

    it('should use default pricing for unknown model', () => {
      const result = service.calculateCost(
        'unknown/model',
        1000,
        1000
      );

      // Default: $0.002/1K input, $0.004/1K output
      expect(result.inputCost).toBe(0.002);
      expect(result.outputCost).toBe(0.004);
      expect(result.totalCost).toBe(0.006);
      expect(result.pricingFound).toBe(false);
    });

    it('should calculate zero cost for local models', () => {
      const result = service.calculateCost(
        'ollama/llama3',
        5000,
        5000
      );

      expect(result.inputCost).toBe(0);
      expect(result.outputCost).toBe(0);
      expect(result.totalCost).toBe(0);
    });

    it('should handle Claude models correctly', () => {
      const result = service.calculateCost(
        'anthropic/claude-3.5-sonnet',
        1000,
        1000
      );

      // Claude 3.5 Sonnet: $0.003/1K input, $0.015/1K output
      expect(result.inputCost).toBe(0.003);
      expect(result.outputCost).toBe(0.015);
      expect(result.totalCost).toBe(0.018);
    });

    it('should round costs to 6 decimal places', () => {
      const result = service.calculateCost(
        'anthropic/claude-3-haiku',
        1234, // odd number to test rounding
        5678
      );

      // Verify it's a proper number with max 6 decimals
      expect(result.totalCost.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(6);
    });
  });

  describe('getPricing', () => {
    it('should return exact match pricing', () => {
      const pricing = service.getPricing('openai/gpt-4');

      expect(pricing.input).toBe(0.03);
      expect(pricing.output).toBe(0.06);
    });

    it('should return default for unknown model', () => {
      const pricing = service.getPricing('completely-unknown-model');

      expect(pricing.input).toBe(0.002);
      expect(pricing.output).toBe(0.004);
    });
  });

  describe('estimateCost', () => {
    it('should estimate cost with default output ratio', () => {
      const estimate = service.estimateCost('openai/gpt-4-turbo', 1000);

      // With 1.5x output ratio: 1000 input + 1500 output
      // (1000/1000 * 0.01) + (1500/1000 * 0.03) = 0.01 + 0.045 = 0.055
      expect(estimate).toBe(0.055);
    });

    it('should use custom output ratio', () => {
      const estimate = service.estimateCost('openai/gpt-4-turbo', 1000, 2.0);

      // With 2.0x output ratio: 1000 input + 2000 output
      // (1000/1000 * 0.01) + (2000/1000 * 0.03) = 0.01 + 0.06 = 0.07
      expect(estimate).toBe(0.07);
    });
  });

  describe('isLocalModel', () => {
    it('should identify local models as free', () => {
      expect(service.isLocalModel('local/llama')).toBe(true);
      expect(service.isLocalModel('ollama/mistral')).toBe(true);
    });

    it('should identify cloud models as not free', () => {
      expect(service.isLocalModel('openai/gpt-4')).toBe(false);
      expect(service.isLocalModel('anthropic/claude-3-opus')).toBe(false);
    });
  });

  describe('addPricing', () => {
    it('should add custom pricing for new model', () => {
      service.addPricing('custom/model', { input: 0.005, output: 0.01 });

      const pricing = service.getPricing('custom/model');
      expect(pricing.input).toBe(0.005);
      expect(pricing.output).toBe(0.01);
    });
  });

  describe('getAllPricing', () => {
    it('should return all known pricing', () => {
      const allPricing = service.getAllPricing();

      expect(Object.keys(allPricing).length).toBeGreaterThan(10);
      expect(allPricing['openai/gpt-4']).toBeDefined();
    });
  });
});
