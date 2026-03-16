import { PersonaType } from '@mentor-ai/shared/types';

export const PERSONA_LABELS: Record<PersonaType, string> = {
  [PersonaType.CFO]: 'Chief Financial Officer (CFO)',
  [PersonaType.CMO]: 'Chief Marketing Officer (CMO)',
  [PersonaType.CTO]: 'Chief Technology Officer (CTO)',
  [PersonaType.OPERATIONS]: 'Chief Operations Officer (COO)',
  [PersonaType.LEGAL]: 'General Counsel (Legal)',
  [PersonaType.CREATIVE]: 'Chief Creative Officer (CCO)',
  [PersonaType.CSO]: 'Chief Strategy Officer (CSO)',
  [PersonaType.SALES]: 'VP of Sales',
};
