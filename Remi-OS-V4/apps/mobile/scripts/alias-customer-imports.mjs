import fs from 'fs';
import path from 'path';

const root = path.join(import.meta.dirname, '..');
const dirs = ['app/customer', 'src/modes/customer', 'src/stores/customer'];

function walk(rel) {
  const dir = path.join(root, rel);
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    const relChild = path.join(rel, ent.name);
    if (ent.isDirectory()) walk(relChild);
    else if (/\.(ts|tsx)$/.test(ent.name)) {
      let text = fs.readFileSync(p, 'utf8');
      const next = text
        .replace(/from '@\//g, "from '@customer/")
        .replace(/from "@\//g, 'from "@customer/');
      if (next !== text) fs.writeFileSync(p, next);
    }
  }
}

for (const d of dirs) walk(d);
console.log('alias-customer-imports done');
