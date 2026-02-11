export interface DataExportCompleteEmailData {
    userName: string;
    format: string;
    fileSize: string;
    downloadUrl: string;
    expiresAt: string;
}
export declare function getDataExportCompleteEmailHtml(data: DataExportCompleteEmailData): string;
export declare function getDataExportCompleteEmailText(data: DataExportCompleteEmailData): string;
