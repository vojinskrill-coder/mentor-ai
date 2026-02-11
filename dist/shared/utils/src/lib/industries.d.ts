/**
 * Industry options for tenant registration
 * These values are used in the registration form dropdown
 * and validated on the backend
 */
export declare const INDUSTRIES: readonly ["Technology", "Healthcare", "Finance", "Retail", "Manufacturing", "Education", "Real Estate", "Legal", "Marketing", "Consulting", "Other"];
export type Industry = (typeof INDUSTRIES)[number];
/** Check if a value is a valid industry */
export declare function isValidIndustry(value: string): value is Industry;
