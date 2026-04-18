import { readdir, unlink, readFile, writeFile } from 'node:fs/promises';
import { join, dirname }                         from 'node:path';
import { fileURLToPath }                         from 'node:url';

const CJS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cjs');

// Write package.json marking this subtree as CJS
await writeFile(
  join(CJS_DIR, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n',
);

// Rename .js -> .cjs and patch internal require() paths
const files = (await readdir(CJS_DIR)).filter(f => f.endsWith('.js') && !f.startsWith('_old_'));

for (const file of files) {
  const oldPath = join(CJS_DIR, file);
  const newName = file.replace(/\.js$/, '.cjs');
  const newPath = join(CJS_DIR, newName);

  let content = await readFile(oldPath, 'utf8');
  content = content.replace(/require\((['"])(\.\.?\/[^'"]+)\.js\1\)/g, "require($1$2.cjs$1)");
  await writeFile(newPath, content);
  await unlink(oldPath); // DELETE the .js — don't rename it to _old_
}

console.log('✅ CJS build post-processed.');