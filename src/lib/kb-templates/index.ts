import type { I18nKey, Locale } from '@/lib/i18n/shared';

import { KB_TEMPLATES } from './templates.gen';

export const BUSINESS_SPHERES = [
  { id: 'events', icon: '🎉', nameKey: 'businessSphereEvents' },
  { id: 'photographer', icon: '📷', nameKey: 'businessSpherePhotographer' },
  { id: 'travel', icon: '✈️', nameKey: 'businessSphereTravel' },
  { id: 'massage', icon: '💆', nameKey: 'businessSphereMassage' },
] as const satisfies readonly { id: string; icon: string; nameKey: I18nKey }[];

export type BusinessSphereId = (typeof BUSINESS_SPHERES)[number]['id'];

export function getKbTemplate(id: BusinessSphereId, locale: Locale, businessName?: string): string {
  const template = KB_TEMPLATES[locale][id];
  const trimmedName = businessName?.trim();
  return trimmedName ? template.replaceAll('{{BUSINESS_NAME}}', trimmedName) : template;
}

export function isBusinessSphereId(value: string): value is BusinessSphereId {
  return BUSINESS_SPHERES.some((sphere) => sphere.id === value);
}
