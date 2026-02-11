export interface TenantDeletionCancelledEmailData {
    userName: string;
    tenantName: string;
}
export declare function getTenantDeletionCancelledEmailHtml(data: TenantDeletionCancelledEmailData): string;
export declare function getTenantDeletionCancelledEmailText(data: TenantDeletionCancelledEmailData): string;
