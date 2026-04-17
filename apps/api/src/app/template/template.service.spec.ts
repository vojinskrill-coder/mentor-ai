import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { TemplateService } from './template.service';
import { TemplateResolutionError } from './template.error';

describe('TemplateService', () => {
  let service: TemplateService;
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'template-test-'));
    service = new TemplateService();
    // Override the template dir
    (service as any).templateDir = tmpDir;
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should resolve a simple template', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'test.md'),
      'Hello {{NAME}}, welcome to {{COMPANY}}!',
    );
    const result = service.resolve('test.md', {
      NAME: 'John',
      COMPANY: 'Acme',
    });
    expect(result).toBe('Hello John, welcome to Acme!');
  });

  it('should resolve multiple occurrences of the same placeholder', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'test.md'),
      '{{NAME}} is {{NAME}}',
    );
    const result = service.resolve('test.md', { NAME: 'Alice' });
    expect(result).toBe('Alice is Alice');
  });

  it('should throw TemplateResolutionError on unresolved placeholders', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'test.md'),
      'Hello {{NAME}}, tenant: {{TENANT_ID}}',
    );
    expect(() =>
      service.resolve('test.md', { NAME: 'John' }),
    ).toThrow(TemplateResolutionError);
  });

  it('should include unresolved placeholder names in error', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'test.md'),
      '{{MISSING_A}} and {{MISSING_B}}',
    );
    try {
      service.resolve('test.md', {});
      fail('Should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateResolutionError);
      const tErr = err as TemplateResolutionError;
      expect(tErr.unresolvedPlaceholders).toContain('{{MISSING_A}}');
      expect(tErr.unresolvedPlaceholders).toContain('{{MISSING_B}}');
    }
  });

  it('should throw on missing template file', () => {
    expect(() => service.resolve('nonexistent.md', {})).toThrow(
      'Template not found',
    );
  });

  it('should resolve content directly', () => {
    const result = service.resolveContent('Hi {{USER}}', { USER: 'Bob' });
    expect(result).toBe('Hi Bob');
  });

  it('should resolveAll templates in a directory', () => {
    fs.mkdirSync(path.join(tmpDir, 'vault'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'vault', 'soul.md'),
      '{{AGENT_NAME}} soul',
    );
    fs.writeFileSync(
      path.join(tmpDir, 'vault', 'config.md'),
      '{{AGENT_NAME}} config',
    );
    const results = service.resolveAll({ AGENT_NAME: 'TestBot' }, 'vault');
    expect(results.size).toBe(2);
    for (const [, content] of results) {
      expect(content).toContain('TestBot');
    }
  });

  it('should throw on missing template directory for resolveAll', () => {
    expect(() => service.resolveAll({}, 'nonexistent')).toThrow(
      'Template directory not found',
    );
  });

  it('should handle empty vars map', () => {
    fs.writeFileSync(path.join(tmpDir, 'plain.md'), 'No placeholders here');
    const result = service.resolve('plain.md', {});
    expect(result).toBe('No placeholders here');
  });

  it('should handle templates with no content', () => {
    fs.writeFileSync(path.join(tmpDir, 'empty.md'), '');
    const result = service.resolve('empty.md', {});
    expect(result).toBe('');
  });

  it('should resolve nested directory templates', () => {
    fs.mkdirSync(path.join(tmpDir, 'deep', 'nested'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'deep', 'nested', 'file.md'),
      '{{VAR}} works',
    );
    const results = service.resolveAll({ VAR: 'Nested' }, 'deep');
    expect(results.size).toBe(1);
    const values = [...results.values()];
    expect(values[0]).toBe('Nested works');
  });

  it('should preserve non-placeholder curly braces', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'code.md'),
      'function() { return {{VALUE}}; }',
    );
    const result = service.resolve('code.md', { VALUE: '42' });
    expect(result).toBe('function() { return 42; }');
  });
});
