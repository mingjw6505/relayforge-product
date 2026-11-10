import {build} from 'esbuild';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const output = resolve(process.argv[2] ?? resolve(root, 'dist/progress-card-preview.html'));
const [template, styles, card, result] = await Promise.all([
  readFile(resolve(root, 'src/preview.html'), 'utf8'),
  readFile(resolve(root, 'src/card.css'), 'utf8'),
  readFile(resolve(root, 'src/card.html'), 'utf8'),
  build({entryPoints: [resolve(root, 'src/preview.mjs')], bundle: true,
    format: 'iife', platform: 'browser', write: false, minify: true}),
]);
const fragment = template.replace('{{STYLE}}', () => styles).replace('{{CARD}}', () => card)
  .replace('{{SCRIPT}}', () => result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
await mkdir(dirname(output), {recursive: true});
await writeFile(output, fragment);
console.log(`Preview: ${output} (${Buffer.byteLength(fragment)} bytes)`);
