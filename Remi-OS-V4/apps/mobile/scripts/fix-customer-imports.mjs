import fs from 'fs';
import path from 'path';

const root = path.join(import.meta.dirname, '..');
const dirs = [
  path.join(root, 'app', 'customer'),
  path.join(root, 'src', 'modes', 'customer'),
  path.join(root, 'src', 'stores', 'customer'),
];

const replacements = [
  [/@customer\/src\//g, '@/src/'],
  [/@customer\/stores\/auth/g, '@/src/stores/auth'],
  [/@customer\/stores\/theme/g, '@/src/stores/customer-theme'],
  [/@customer\/stores\/booking/g, '@/src/stores/customer/booking'],
  [/@customer\/stores\/onboarding/g, '@/src/stores/customer/onboarding'],
  [/@customer\/stores\/demo-/g, '@/src/stores/customer/demo-'],
];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(ent.name)) {
      let text = fs.readFileSync(p, 'utf8');
      let next = text;
      for (const [re, to] of replacements) {
        next = next.replace(re, to);
      }
      if (next !== text) fs.writeFileSync(p, next);
    }
  }
}

for (const d of dirs) walk(d);
console.log('Customer import fixes applied');
