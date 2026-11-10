import {build} from 'esbuild';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {dirname, resolve, basename} from 'node:path';
import {fileURLToPath} from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(await readFile(resolve(root, '../../plugin.json'), 'utf8'));
const [styles, card] = await Promise.all([
  readFile(resolve(root, 'src/card.css'), 'utf8'),
  readFile(resolve(root, 'src/card.html'), 'utf8'),
]);
const result = await build({entryPoints: [resolve(root, 'src/main.js')], bundle: true,
  format: 'esm', platform: 'browser', minify: true, write: false, metafile: true,
  define: {__PLUGIN_VERSION__: JSON.stringify(manifest.version)}, legalComments: 'eof'});
const template = await readFile(resolve(root, 'src/panel.html'), 'utf8');
const html = template.replace('{{VERSION}}', manifest.version)
  .replace('{{STYLE}}', () => styles)
  .replace('{{CARD}}', () => card)
  .replace('{{SCRIPT}}', () => result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script'));
await mkdir(resolve(root, '../static'), {recursive: true});
await writeFile(resolve(root, '../static/panel.html'), html);

const packages = new Map();
for (const input of Object.keys(result.metafile.inputs)) {
  let directory = dirname(resolve(root, input));
  while (directory.includes('node_modules')) {
    try {
      const data = JSON.parse(await readFile(resolve(directory, 'package.json'), 'utf8'));
      if (data.name && data.version) {packages.set(directory, data); break;}
    } catch {}
    directory = dirname(directory);
  }
}
const notices = ['Third-party code bundled in static/panel.html. Build dependencies are not needed at runtime.\n'];
for (const [directory, pkg] of [...packages].sort()) {
  let license = '';
  for (const filename of ['LICENSE', 'LICENSE.txt', 'LICENSE.md', 'LICENSE-MIT', 'license']) {
    try {license = await readFile(resolve(directory, filename), 'utf8'); break;} catch {}
  }
  if (!license) throw new Error(`Missing license text for ${pkg.name}`);
  notices.push(`${pkg.name} ${pkg.version} (${pkg.license})\n${license}`);
}
await writeFile(resolve(root, '../THIRD_PARTY_NOTICES.txt'), notices.join('\n\n---\n\n').replace(/[ \t]+$/gm, ''));
console.log(`${basename(resolve(root, '../static/panel.html'))}: ${Buffer.byteLength(html)} bytes, ${packages.size} license notices`);
