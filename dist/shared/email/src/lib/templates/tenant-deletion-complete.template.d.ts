export interface TenantDeletionCompleteEmailData {
    userName: string;
    tenantName: string;
    certificateReference: string;
}
export declare function getTenantDeletionCompleteEmailHtml(data: TenantDeletionCompleteEmailData): string;
export declare function getTenantDeletionCompleteEmailText(data: TenantDeletionCompleteEmailData): string;
