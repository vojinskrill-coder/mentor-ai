import { MarkdownGenerator } from './markdown.generator';
import type { ExportDataSection } from '@mentor-ai/shared/types';
import type { ExportMetadata } from './format-generator.interface';

describe('MarkdownGenerator', () => {
  let generator: MarkdownGenerator;

  const metadata: ExportMetadata = {
    userName: 'Test User',
    userEmail: 'test@test.com',
    tenantName: 'Test Corp',
    exportDate: '2025-01-15T10:00:00.000Z',
  };

  beforeEach(() => {
    generator = new MarkdownGenerator();
  });

  it('should have correct format properties', () => {
    expect(generator.formatKey).toBe('MARKDOWN');
    expect(generator.mimeType).toBe('text/markdown');
    expect(generator.fileExtension).toBe('.md');
  });

  it('should generate markdown with title and metadata', async () => {
    const sections: ExportDataSection[] = [
      {
        key: 'profile',
        title: 'User Profile',
        items: [{ email: 'test@test.com', name: 'Test User' }],
        itemCount: 1,
      },
    ];

    const buffer = await generator.generate(sections, metadata);
    const md = buffer.toString();

    expect(md).toContain('Data Export');
    expect(md).toContain('Test Corp');
    expect(md).toContain('Test User');
    expect(md).toContain('User Profile');
  });

  it('should show "No data available" for empty sections', async () => {
    const sections: ExportDataSection[] = [
      {
        key: 'invitations',
        title: 'Invitation History',
        items: [],
        itemCount: 0,
      },
    ];

    const buffer = await generator.generate(sections, metadata);
    const md = buffer.toString();

    expect(md).toContain('Invitation History');
    expect(md).toContain('No data available');
  });

  it('should generate tables for sections with items', async () => {
    const sections: ExportDataSection[] = [
      {
        key: 'profile',
        title: 'User Profile',
        items: [{ email: 'user@test.com', role: 'MEMBER' }],
        itemCount: 1,
      },
    ];

    const buffer = await generator.generate(sections, metadata);
    const md = buffer.toString();

    // Should contain table headers and data
    expect(md).toContain('email');
    expect(md).toContain('role');
    expect(md).toContain('user@test.com');
    expect(md).toContain('MEMBER');
  });
});
