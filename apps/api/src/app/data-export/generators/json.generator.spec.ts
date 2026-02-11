import { JsonGenerator } from './json.generator';
import type { ExportDataSection } from '@mentor-ai/shared/types';
import type { ExportMetadata } from './format-generator.interface';

describe('JsonGenerator', () => {
  let generator: JsonGenerator;

  const metadata: ExportMetadata = {
    userName: 'Test User',
    userEmail: 'test@test.com',
    tenantName: 'Test Corp',
    exportDate: '2025-01-15T10:00:00.000Z',
  };

  beforeEach(() => {
    generator = new JsonGenerator();
  });

  it('should have correct format properties', () => {
    expect(generator.formatKey).toBe('JSON');
    expect(generator.mimeType).toBe('application/json');
    expect(generator.fileExtension).toBe('.json');
  });

  it('should generate valid JSON with metadata and sections', async () => {
    const sections: ExportDataSection[] = [
      {
        key: 'profile',
        title: 'User Profile',
        items: [{ email: 'test@test.com', name: 'Test User' }],
        itemCount: 1,
      },
    ];

    const buffer = await generator.generate(sections, metadata);
    const parsed = JSON.parse(buffer.toString());

    expect(parsed.exportMetadata).toBeDefined();
    expect(parsed.exportMetadata.userName).toBe('Test User');
    expect(parsed.exportMetadata.tenantName).toBe('Test Corp');
    expect(parsed.exportMetadata.schemaVersion).toBe('1.0');
    expect(parsed.sections.profile).toBeDefined();
    expect(parsed.sections.profile.items[0].email).toBe('test@test.com');
  });

  it('should handle empty sections', async () => {
    const sections: ExportDataSection[] = [
      {
        key: 'invitations',
        title: 'Invitation History',
        items: [],
        itemCount: 0,
      },
    ];

    const buffer = await generator.generate(sections, metadata);
    const parsed = JSON.parse(buffer.toString());

    expect(parsed.sections.invitations.itemCount).toBe(0);
    expect(parsed.sections.invitations.items).toEqual([]);
  });

  it('should handle multiple sections', async () => {
    const sections: ExportDataSection[] = [
      {
        key: 'profile',
        title: 'User Profile',
        items: [{ email: 'user@test.com' }],
        itemCount: 1,
      },
      {
        key: 'invitations',
        title: 'Invitation History',
        items: [{ type: 'sent' }, { type: 'received' }],
        itemCount: 2,
      },
    ];

    const buffer = await generator.generate(sections, metadata);
    const parsed = JSON.parse(buffer.toString());

    expect(Object.keys(parsed.sections)).toHaveLength(2);
    expect(parsed.sections.profile.itemCount).toBe(1);
    expect(parsed.sections.invitations.itemCount).toBe(2);
  });
});
