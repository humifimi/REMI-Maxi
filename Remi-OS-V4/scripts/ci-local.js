#!/usr/bin/env node
/**
 * Local CI — replaces GitHub Actions for this monorepo.
 * Run from repo root: npm run ci:local
 */
const { spawnSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');

function run(cmd, args, cwd) {
  console.log(`\n> ${cmd} ${args.join(' ')}  (${cwd})`);
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: true });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run('npm', ['run', 'lint', '--workspace=@remi/api'], root);
run('npm', ['run', 'typecheck', '--workspace=@remi/api'], root);
run('npm', ['run', 'test', '--workspace=@remi/api'], root);
run('npm', ['run', 'lint', '--workspace=@remi/mobile'], root);
run('npm', ['run', 'test', '--workspace=@remi/mobile'], root);

console.log('\nLocal CI finished OK.');
