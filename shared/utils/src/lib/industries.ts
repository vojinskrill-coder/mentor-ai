/**
 * Industry options for tenant registration
 * These values are used in the registration form dropdown
 * and validated on the backend
 */

export const INDUSTRIES = [
  'Technology',
  'Healthcare',
  'Finance',
  'Retail',
  'Manufacturing',
  'Education',
  'Real Estate',
  'Legal',
  'Marketing',
  'Consulting',
  'Other',
] as const;

export type Industry = (typeof INDUSTRIES)[number];

/** Check if a value is a valid industry */
export function isValidIndustry(value: string): value is Industry {
  return INDUSTRIES.includes(value as Industry);
}
