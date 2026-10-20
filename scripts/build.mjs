import { mkdir, copyFile, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = ['index.html', 'favicon.svg', ...(await readdir(path.join(root, 'src'))).map(name => `src/${name}`)];
for (const file of files) {
  if (file.endsWith('.js')) execFileSync(process.execPath, ['--check', path.join(root, file)], { stdio: 'inherit' });
  const target = path.join(root, 'dist', file);
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(path.join(root, file), target);
}
console.log(`Сборка готова: dist/ (${files.length} файлов). Проверка синтаксиса JavaScript пройдена.`);
