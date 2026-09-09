// デモ版を 1 ファイルの HTML にまとめる（メールやチャットで共有して、開くだけで画面を確認できる）
// 使い方: node scripts/build-demo-single.mjs  → demo/standalone.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

let html = read('demo/index.html');
html = html.replace('<link rel="stylesheet" href="../public/style.css">', `<style>\n${read('public/style.css')}\n</style>`);
html = html.replace('<script src="../public/demo-mock.js"></script>', `<script>\n${read('public/demo-mock.js')}\n</script>`);
html = html.replace('<script src="../public/app.js"></script>', `<script>\n${read('public/app.js')}\n</script>`);

fs.writeFileSync(path.join(root, 'demo/standalone.html'), html);
console.log('wrote demo/standalone.html', (html.length / 1024).toFixed(0), 'KB');

// Artifact 用（外側の骨組みなし）
if (process.argv[2]) {
  const body = html
    .replace(/^[\s\S]*?<title>/, '<title>')
    .replace(/<\/head>\s*<body>/, '')
    .replace(/<\/body>\s*<\/html>\s*$/, '');
  fs.writeFileSync(process.argv[2], body);
  console.log('wrote', process.argv[2]);
}
