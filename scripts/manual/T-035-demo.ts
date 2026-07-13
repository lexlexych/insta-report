import { BUSINESS_SPHERES, getKbTemplate, isBusinessSphereId } from '../../src/lib/kb-templates';
import type { Locale } from '../../src/lib/i18n/shared';

const locales: Locale[] = ['ru', 'de'];

for (const locale of locales) {
  for (const sphere of BUSINESS_SPHERES) {
    const template = getKbTemplate(sphere.id, locale);

    if (!template.startsWith('# ') || !template.includes('\n- ')) {
      throw new Error(`Invalid template content for ${locale}/${sphere.id}`);
    }

    console.log(`${locale}/${sphere.id}: ${template.split('\n')[0]}`);
  }
}

if (isBusinessSphereId('unknown')) {
  throw new Error('Unknown sphere ID must not pass validation');
}

console.log('T-035 demo OK');
