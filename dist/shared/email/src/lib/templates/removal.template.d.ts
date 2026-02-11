export interface RemovalEmailData {
    memberName: string;
    tenantName: string;
    strategy: 'REASSIGN' | 'ARCHIVE';
    contactEmail?: string;
}
export declare function getRemovalEmailHtml(data: RemovalEmailData): string;
export declare function getRemovalEmailText(data: RemovalEmailData): string;
