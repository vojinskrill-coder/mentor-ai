import type { ExportDataSection } from '@mentor-ai/shared/types';

export interface FormatGenerator {
  readonly formatKey: string;
  readonly mimeType: string;
  readonly fileExtension: string;

  generate(
    sections: ExportDataSection[],
    metadata: ExportMetadata
  ): Promise<Buffer>;
}

export interface ExportMetadata {
  userName: string;
  userEmail: string;
  tenantName: string;
  exportDate: string;
}
