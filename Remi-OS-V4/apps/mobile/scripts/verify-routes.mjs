/**
 * Static route audit for the unified mobile app.
 * Maps navigated paths → expected route files under app/.
 */
import fs from 'fs';
import path from 'path';

const APP = path.join(import.meta.dirname, '..', 'app');

const SKIP_DIRS = new Set(['__tests__']);

function walkRoutes(dir, prefix = '') {
  const routes = new Set();
  if (!fs.existsSync(dir)) return routes;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    const segment = ent.name.replace(/^\((.+)\)$/, '($1)');
    if (ent.isDirectory()) {
      const nextPrefix = prefix ? `${prefix}/${segment}` : segment;
      for (const r of walkRoutes(full, nextPrefix)) routes.add(r);
      continue;
    }
    if (!/\.(tsx|ts|jsx|js)$/.test(ent.name)) continue;
    const base = ent.name.replace(/\.(tsx|ts|jsx|js)$/, '');
    if (base === '_layout' || base === '+not-found') continue;
    const routePath =
      base === 'index'
        ? prefix || '/'
        : `${prefix}/${base}`.replace(/\/\(([^)]+)\)/g, '');
    routes.add(routePath === '' ? '/' : routePath);
  }
  return routes;
}

function normalizeNavPath(raw) {
  let p = raw.split('?')[0].split('#')[0];
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(/\/\((auth|tabs|onboarding|public)\)/g, '');
  return p.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
}

function pathToFileCandidates(routePath) {
  const clean = routePath === '/' ? '' : routePath.replace(/^\//, '');
  if (!clean) return ['(tabs)/index.tsx', 'index.tsx'];
  const parts = clean.split('/');
  const candidates = [];
  candidates.push(`${parts.join('/')}.tsx`);
  candidates.push(`${parts.join('/')}/index.tsx`);
  const last = parts[parts.length - 1];
  if (last?.startsWith('[')) {
    const parent = parts.slice(0, -1).join('/');
    candidates.push(parent ? `${parent}/[id].tsx` : '[id].tsx');
    candidates.push(parent ? `${parent}/[id]/index.tsx` : '[id]/index.tsx');
  }
  return candidates;
}

function fileExists(rel) {
  const full = path.join(APP, rel.replace(/\//g, path.sep));
  return fs.existsSync(full);
}

function collectNavPaths(dir) {
  const paths = new Set();
  const re =
    /router\.(?:push|replace)\(\s*(?:\{[^}]*pathname:\s*)?['"`]([^'"`$]+)['"`]|router\.(?:push|replace)\(\s*`([^`$]+)/g;
  function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) {
        if (ent.name === 'node_modules') continue;
        walk(p);
      } else if (/\.(tsx|ts)$/.test(ent.name)) {
        const text = fs.readFileSync(p, 'utf8');
        let m;
        while ((m = re.exec(text))) {
          const raw = m[1] ?? m[2];
          if (raw && !raw.includes('${')) paths.add(normalizeNavPath(raw));
        }
      }
    }
  }
  walk(dir);
  walk(path.join(import.meta.dirname, '..', 'src', 'modes'));
  return paths;
}

const registered = walkRoutes(APP);
const navPaths = collectNavPaths(APP);

const missing = [];
const customerOnTech = [];
const techOnCustomer = [];

for (const nav of navPaths) {
  if (nav.includes('${')) continue;
  const candidates = pathToFileCandidates(nav);
  const exists =
    candidates.some(fileExists) ||
    [...registered].some((r) => nav === r || nav.startsWith(`${r}/`));
  if (!exists) missing.push({ nav, candidates });

  if (nav.match(/^\/customer\/\d+$/)) customerOnTech.push(nav);
  if (
    nav.startsWith('/fleet/') ||
    nav.startsWith('/booking/') ||
    nav.startsWith('/vehicle/') ||
    nav.startsWith('/appointment/') ||
    nav === '/referral'
  ) {
    if (!nav.startsWith('/customer')) techOnCustomer.push(nav);
  }
}

console.log('=== Route verification ===\n');
console.log(`Registered route files: ${registered.size}`);
console.log(`Static nav paths scanned: ${navPaths.size}\n`);

if (missing.length === 0) {
  console.log('OK: All scanned static navigation paths resolve to route files.\n');
} else {
  console.log(`MISSING (${missing.length}):`);
  for (const { nav, candidates } of missing.slice(0, 30)) {
    console.log(`  ${nav}  (tried: ${candidates.join(', ')})`);
  }
  if (missing.length > 30) console.log(`  ... and ${missing.length - 30} more`);
  console.log('');
}

if (customerOnTech.length) {
  console.log('WARN: Technician paths still using /customer/:id (should be /customers/:id):');
  customerOnTech.forEach((p) => console.log(`  ${p}`));
  console.log('');
}

if (techOnCustomer.length) {
  console.log('WARN: Harvest-style paths without /customer prefix (may hit technician routes):');
  techOnCustomer.forEach((p) => console.log(`  ${p}`));
  console.log('');
}

const keyTech = [
  '/customers',
  '/job/new/confirm-vehicle',
  '/fleet',
  '/settings',
  '/franchise/messages',
  '/message',
  '/pending-reality/review',
];
const keyCustomer = [
  '/customer',
  '/customer/booking/select-service',
  '/customer/fleet',
  '/customer/appointment',
  '/customer/inbox/approvals',
];

console.log('Key technician routes:');
for (const r of keyTech) {
  const ok = pathToFileCandidates(r).some(fileExists) || registered.has(r);
  console.log(`  ${ok ? 'OK' : 'MISSING'}  ${r}`);
}
console.log('\nKey customer routes:');
for (const r of keyCustomer) {
  const ok = pathToFileCandidates(r).some(fileExists) || [...registered].some((x) => r.startsWith(x));
  console.log(`  ${ok ? 'OK' : 'MISSING'}  ${r}`);
}

process.exit(missing.length > 0 ? 1 : 0);
