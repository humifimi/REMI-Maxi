import fs from 'fs';
import path from 'path';

const roots = [
  path.join(import.meta.dirname, '..', 'app', 'customer'),
  path.join(import.meta.dirname, '..', 'src', 'modes', 'customer'),
  path.join(import.meta.dirname, '..', 'src', 'stores', 'customer'),
];

const SKIP_FILES = new Set([
  path.normalize('src/modes/customer/api/endpoints.ts'),
]);

const ROUTE_SEGMENTS = [
  'booking',
  'fleet',
  'vehicle',
  'appointment',
  'referral',
  'inbox',
  'messages',
  'schedule',
  'profile',
  'payment-methods',
  'preferences',
  'notification-settings',
];

function rewrite(text) {
  let next = text
    .replace(/'\/\(tabs\)'/g, "'/customer'")
    .replace(/"\/\(tabs\)"/g, '"/customer"')
    .replace(/'\/\(tabs\)\//g, "'/customer/")
    .replace(/"\/\(tabs\)\//g, '"/customer/')
    .replace(/'\/\(auth\)\//g, "'/customer/")
    .replace(/"\/\(auth\)\//g, '"/customer/')
    .replace(/'\/\(onboarding\)\//g, "'/customer/")
    .replace(/"\/\(onboarding\)\//g, '"/customer/');

  for (const segment of ROUTE_SEGMENTS) {
    const escaped = segment.replace(/-/g, '\\-');
    const re = new RegExp(`(['"\`])(?!/customer)/${escaped}(?=[/'"\`?])`, 'g');
    next = next.replace(re, `$1/customer/${segment}`);
  }

  return next;
}

function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs)$/.test(ent.name)) {
      const rel = path.relative(path.join(import.meta.dirname, '..'), p);
      if (SKIP_FILES.has(path.normalize(rel))) continue;
      const text = fs.readFileSync(p, 'utf8');
      const next = rewrite(text);
      if (next !== text) {
        fs.writeFileSync(p, next);
        console.log('updated', path.relative(path.join(import.meta.dirname, '..'), p));
      }
    }
  }
}

for (const root of roots) {
  if (fs.existsSync(root)) walk(root);
}
console.log('Customer route paths updated');
