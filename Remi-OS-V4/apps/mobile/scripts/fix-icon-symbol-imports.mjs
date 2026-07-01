import fs from 'fs';
import path from 'path';

const root = path.join(import.meta.dirname, '..');
const target = "from '@/components/ui/icon-symbol'";
const dirs = [
  path.join(root, 'app', 'customer'),
  path.join(root, 'src', 'modes', 'customer'),
];

const patterns = [
  /from ['"]@customer\/components-root\/ui\/icon-symbol['"]/g,
  /from ['"]\.\.\/.*packages\/ui\/src\/icon-symbol['"]/g,
  /from ['"]\.\.\/+\.\.\/components\/ui\/icon-symbol['"]/g,
  /from ['"]\.\.\/customer\/components-root\/ui\/icon-symbol['"]/g,
];

function walk(dir) {
  if (!fs.existsSync(dir)) return;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(ent.name)) {
      let text = fs.readFileSync(p, 'utf8');
      if (!text.includes('icon-symbol')) continue;
      let next = text;
      for (const re of patterns) {
        next = next.replace(re, target);
      }
      if (next !== text) {
        fs.writeFileSync(p, next);
        console.log('fixed', path.relative(root, p));
      }
    }
  }
}

for (const d of dirs) walk(d);
