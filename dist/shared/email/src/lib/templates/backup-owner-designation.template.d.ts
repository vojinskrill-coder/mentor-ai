export interface BackupOwnerDesignationEmailData {
    designatedName: string;
    tenantName: string;
    designatedBy: string;
}
export declare function getBackupOwnerDesignationEmailHtml(data: BackupOwnerDesignationEmailData): string;
export declare function getBackupOwnerDesignationEmailText(data: BackupOwnerDesignationEmailData): string;
