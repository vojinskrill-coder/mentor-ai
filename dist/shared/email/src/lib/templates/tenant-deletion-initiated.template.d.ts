export interface TenantDeletionInitiatedEmailData {
    userName: string;
    tenantName: string;
    requestedByName: string;
    requestedByEmail: string;
    gracePeriodEndsAt: string;
}
export declare function getTenantDeletionInitiatedEmailHtml(data: TenantDeletionInitiatedEmailData): string;
export declare function getTenantDeletionInitiatedEmailText(data: TenantDeletionInitiatedEmailData): string;
