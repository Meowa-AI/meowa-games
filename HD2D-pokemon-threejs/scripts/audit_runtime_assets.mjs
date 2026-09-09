#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const nodeRequire = createRequire(import.meta.url);
const used = new Map();
const modules = new Map();
const mediaPattern = /\.(?:png|svg|wav|webp|gif|mp3|ogg|json)$/i;
const probeStop = new Error('asset audit: stop before constructing the scene');

function add(url, reason) {
  if (typeof url !== 'string') return;
  url = url.replace(/^\//, '');
  if (!url.startsWith('assets/') || !mediaPattern.test(url)) return;
  const reasons = used.get(url) ?? new Set();
  reasons.add(reason);
  used.set(url, reasons);
}

function visit(value, reason) {
  if (typeof value === 'string') add(value, reason);
  else if (Array.isArray(value)) value.forEach((entry) => visit(entry, reason));
  else if (value && typeof value === 'object') Object.values(value).forEach((entry) => visit(entry, reason));
}

function loadTs(filename) {
  let full = path.resolve(root, filename);
  if (!path.extname(full)) full += '.ts';
  if (full.endsWith('.json')) return JSON.parse(fs.readFileSync(full, 'utf8'));
  if (modules.has(full)) return modules.get(full).exports;
  if (full.endsWith('/core/AssetLoader.ts')) {
    return { loadPixelTexture: (url) => {
      add(url, 'texture loader probe');
      return Promise.reject(probeStop);
    } };
  }
  const module = { exports: {} };
  modules.set(full, module);
  const code = ts.transpileModule(fs.readFileSync(full, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: full,
  }).outputText;
  const localRequire = (specifier) => specifier.startsWith('.')
    ? loadTs(path.resolve(path.dirname(full), specifier)) : nodeRequire(specifier);
  vm.runInThisContext(`(function(require,module,exports){${code}\n})`, { filename: full })(localRequire, module, module.exports);
  return module.exports;
}

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? files(full) : [full];
  });
}

const { MAPS } = loadTs('src/map/maps.ts');
visit(MAPS, 'registered map data');
visit(loadTs('src/battle/BattleData.ts').SPECIES, 'starter selection');
const catalog = loadTs('src/battle/PokemonCatalog.ts');
visit(catalog.POKEMON_ATLAS, 'catalog and saved-party fallback');
// Keep cries for the opening roster, including partners stored in the save.
const audio = loadTs('src/audio/Bgm.ts');
for (const species of catalog.POKEMON_CATALOG) add(audio.cryUrl(species.id), 'catalog and saved-party cry');
visit(audio.SFX, 'audio event mapping');
visit(loadTs('src/battle/BattleEntryAssets.ts'), 'battle entry and release sequence');

for (const full of files(path.join(root, 'src')).filter((p) => p.endsWith('.ts') && !p.endsWith('.test.ts'))) {
  const source = ts.createSourceFile(full, fs.readFileSync(full, 'utf8'), ts.ScriptTarget.Latest, true);
  function scan(node) {
    if (ts.isStringLiteralLike(node)) {
      add(node.text, path.relative(root, full));
      for (const match of node.text.matchAll(/(?:url\(["']?)(\/?assets\/[^\s"')]+)["']?\)/g)) add(match[1], path.relative(root, full));
    }
    ts.forEachChild(node, scan);
  }
  scan(source);
}

const builders = loadTs('src/map/BuildingBuilder.ts');
const probes = ['buildHouse', 'buildLab', 'buildOldaleHouse', 'buildOldaleMart', 'buildOldaleCenter', 'buildSign']
  .map((name) => builders[name]());
probes.push(loadTs('src/battle/BattleEnvironment.ts').buildBattleEnvironment(undefined));
for (const result of await Promise.allSettled(probes)) {
  if (result.status === 'rejected' && result.reason !== probeStop) throw result.reason;
}

const animationUrl = 'assets/sprites/pokemon-animated/manifest.json';
add(animationUrl, 'animation catalog');
visit(JSON.parse(fs.readFileSync(path.join(root, 'public', animationUrl), 'utf8')), 'animation catalog');
const actual = files(path.join(root, 'public/assets'))
  .filter((full) => mediaPattern.test(full))
  .map((full) => path.relative(path.join(root, 'public'), full));
const missing = [...used.keys()].filter((url) => !fs.existsSync(path.join(root, 'public', url))).sort();
const unused = actual.filter((url) => !used.has(url)).sort();
const report = {
  used: [...used].sort(([a], [b]) => a.localeCompare(b)).map(([url, reasons]) => ({ url, reasons: [...reasons] })),
  missing,
  unused,
};
const outputIndex = process.argv.indexOf('--output');
if (outputIndex !== -1) {
  const output = path.resolve(process.argv[outputIndex + 1]);
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify({ used: used.size, actual: actual.length, missing, unused }, null, 2));
if (missing.length || unused.length) process.exitCode = 1;
