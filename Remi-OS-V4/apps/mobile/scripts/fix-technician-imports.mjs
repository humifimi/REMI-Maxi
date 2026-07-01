/**
 * Rewire @/src/{api,hooks,components,...} → @technician/* after harvest.
 * Preserves shared shell paths via placeholders (substring-safe).
 */
import fs from 'fs';
import path from 'path';

const root = path.join(import.meta.dirname, '..');

const walkRoots = [
  path.join(root, 'app'),
  path.join(root, 'src', 'modes', 'technician'),
  path.join(root, 'src', 'navigation'),
  path.join(root, 'src', 'stores'),
  path.join(root, 'src', 'components', 'shared'),
];

const skipDir = (p) =>
  p.includes(`${path.sep}app${path.sep}customer${path.sep}`) ||
  p.includes(`${path.sep}modes${path.sep}customer${path.sep}`) ||
  p.includes(`${path.sep}harvest${path.sep}`);

const PLACEHOLDERS = [
  ['@/src/components/shared/', '@@REMI_SHARED@@'],
  ['@/src/stores/customer/', '@@REMI_CUST_STORE@@'],
  ['@/src/stores/auth', '@@REMI_AUTH@@'],
  ['@/src/stores/app-mode', '@@REMI_APP_MODE@@'],
  ['@/src/stores/customer-theme', '@@REMI_CUST_THEME@@'],
  ['@/src/navigation/', '@@REMI_NAV@@'],
  ['@technician/components/shared/', '@@REMI_SHARED@@'],
  ['@technician/stores/auth', '@@REMI_AUTH@@'],
  ['@technician/stores/app-mode', '@@REMI_APP_MODE@@'],
  ['@technician/stores/customer-theme', '@@REMI_CUST_THEME@@'],
];

const migrations = [
  ['@/src/schemas/', '@technician/schemas/'],
  ['@/src/screens/', '@technician/screens/'],
  ['@/src/api/', '@technician/api/'],
  ['@/src/hooks/', '@technician/hooks/'],
  ['@/src/components/', '@technician/components/'],
  ['@/src/types/', '@technician/types/'],
  ['@/src/utils/', '@technician/utils/'],
  ['@/src/constants/', '@technician/constants/'],
  ['@/src/services/', '@technician/services/'],
  ['@/src/notifications/', '@technician/notifications/'],
  ['@/src/stores/', '@technician/stores/'],
];

const restore = [
  ['@@REMI_SHARED@@', '@/src/components/shared/'],
  ['@@REMI_CUST_STORE@@', '@/src/stores/customer/'],
  ['@@REMI_AUTH@@', '@/src/stores/auth'],
  ['@@REMI_APP_MODE@@', '@/src/stores/app-mode'],
  ['@@REMI_CUST_THEME@@', '@/src/stores/customer-theme'],
  ['@@REMI_NAV@@', '@/src/navigation/'],
];

function transform(text) {
  let next = text;
  for (const [from, to] of PLACEHOLDERS) {
    next = next.split(from).join(to);
  }
  for (const [from, to] of migrations) {
    next = next.split(from).join(to);
  }
  for (const [from, to] of restore) {
    next = next.split(from).join(to);
  }
  return next;
}

function walk(dir) {
  if (!fs.existsSync(dir) || skipDir(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(ts|tsx|js|jsx|mjs)$/.test(ent.name)) {
      const text = fs.readFileSync(p, 'utf8');
      const next = transform(text);
      if (next !== text) fs.writeFileSync(p, next);
    }
  }
}

for (const d of walkRoots) walk(d);
console.log('Technician import paths updated');
