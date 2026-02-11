import { Injectable } from '@nestjs/common';
import type { ExportDataSection } from '@mentor-ai/shared/types';
import type { FormatGenerator, ExportMetadata } from './format-generator.interface';

@Injectable()
export class JsonGenerator implements FormatGenerator {
  readonly formatKey = 'JSON';
  readonly mimeType = 'application/json';
  readonly fileExtension = '.json';

  async generate(
    sections: ExportDataSection[],
    metadata: ExportMetadata
  ): Promise<Buffer> {
    const exportData = {
      exportMetadata: {
        generatedAt: metadata.exportDate,
        userName: metadata.userName,
        userEmail: metadata.userEmail,
        tenantName: metadata.tenantName,
        schemaVersion: '1.0',
      },
      sections: sections.reduce(
        (acc, section) => {
          acc[section.key] = {
            title: section.title,
            itemCount: section.itemCount,
            items: section.items,
          };
          return acc;
        },
        {} as Record<string, unknown>
      ),
    };

    return Buffer.from(JSON.stringify(exportData, null, 2), 'utf-8');
  }
}
