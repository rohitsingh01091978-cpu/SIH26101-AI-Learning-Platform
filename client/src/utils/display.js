// Small display helpers (presentation only - nothing here changes stored data).

// Label shown for the training catalog. Older catalog rows carry a legacy "Prototype ..." source string in the
// database, so anything that reads as a prototype label is shown under the accurate, professional name instead.
export const CATALOG_LABEL = 'iGOT-aligned Training Catalog';

export function catalogLabel(source) {
  if (!source || /prototype/i.test(source)) return CATALOG_LABEL;
  return source;
}

// "kritika.singh@ustu.edu.in" -> "kr•••••@ustu.edu.in": enough to recognise the account, not enough to read it aloud.
export function maskEmail(email) {
  if (typeof email !== 'string' || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  const visible = local.slice(0, Math.min(2, Math.max(1, local.length - 1)));
  return `${visible}${'•'.repeat(Math.max(3, Math.min(6, local.length - visible.length)))}@${domain}`;
}

export const roleLabel = (role) => (role === 'ADMIN' ? 'Administrator' : 'Learner');
