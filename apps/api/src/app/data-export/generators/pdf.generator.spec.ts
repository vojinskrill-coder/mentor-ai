import { PdfGenerator } from './pdf.generator';
import type { ExportDataSection } from '@mentor-ai/shared/types';
import type { ExportMetadata } from './format-generator.interface';

// Mock pdfmake to avoid native dependency issues in test env
const mockPdfDoc = {
  on: jest.fn(),
  end: jest.fn(),
};

jest.mock('pdfmake', () => {
  return jest.fn().mockImplementation(() => ({
    createPdfKitDocument: jest.fn().mockImplementation(() => {
      const handlers: Record<string, ((data?: Buffer) => void)[]> = {};
      return {
        on: jest.fn((event: string, handler: (data?: Buffer) => void) => {
          if (!handlers[event]) handlers[event] = [];
          handlers[event]!.push(handler);
        }),
        end: jest.fn(() => {
          setTimeout(() => {
            for (const h of handlers['data'] ?? []) h(Buffer.from('%PDF-1.4 test'));
            for (const h of handlers['end'] ?? []) h();
          }, 0);
        }),
      };
    }),
  }));
});

describe('PdfGenerator', () => {
  let generator: PdfGenerator;

  const metadata: ExportMetadata = {
    userName: 'Test User',
    userEmail: 'test@test.com',
    tenantName: 'Test Corp',
    exportDate: '2025-01-15T10:00:00.000Z',
  };

  beforeEach(() => {
    generator = new PdfGenerator();
  });

  it('should have correct format properties', () => {
    expect(generator.formatKey).toBe('PDF');
    expect(generator.mimeType).toBe('application/pdf');
    expect(generator.fileExtension).toBe('.pdf');
  });

  it('should generate a PDF buffer with content', async () => {
    const sections: ExportDataSection[] = [
      {
        key: 'profile',
        title: 'User Profile',
        items: [{ email: 'test@test.com', name: 'Test User' }],
        itemCount: 1,
      },
    ];

    const buffer = await generator.generate(sections, metadata);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('should handle empty sections gracefully', async () => {
    const sections: ExportDataSection[] = [
      {
        key: 'invitations',
        title: 'Invitation History',
        items: [],
        itemCount: 0,
      },
    ];

    const buffer = await generator.generate(sections, metadata);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });

  it('should handle multiple sections', async () => {
    const sections: ExportDataSection[] = [
      {
        key: 'profile',
        title: 'User Profile',
        items: [{ email: 'user@test.com', role: 'MEMBER' }],
        itemCount: 1,
      },
      {
        key: 'invitations',
        title: 'Invitation History',
        items: [
          { type: 'sent', email: 'invited@test.com' },
          { type: 'received', email: 'owner@test.com' },
        ],
        itemCount: 2,
      },
    ];

    const buffer = await generator.generate(sections, metadata);

    expect(buffer).toBeInstanceOf(Buffer);
    expect(buffer.length).toBeGreaterThan(0);
  });
});
