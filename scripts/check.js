const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const jsFiles = [
  'main.js',
  'preload.js',
  'store.js',
  'tray.js',
  'generate-assets.js',
  'renderer/pet.js',
  'renderer/chat.js',
  'renderer/setup.js'
];

const htmlFiles = [
  'renderer/index.html',
  'renderer/setup.html'
];

function runNodeCheck(file) {
  const result = spawnSync(process.execPath, ['--check', file], {
    cwd: root,
    encoding: 'utf8'
  });

  if (result.status !== 0) {
    process.stderr.write(result.stderr || result.stdout);
    process.exitCode = 1;
  }
}

function assertContains(file, snippets) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      console.error(`${file} is missing required markup: ${snippet}`);
      process.exitCode = 1;
    }
  }
}

for (const file of jsFiles) runNodeCheck(file);

assertContains('renderer/index.html', [
  'id="status-panel"',
  'id="bubble"',
  'id="dog-wrapper"',
  'pet.js',
  'chat.js'
]);

assertContains('renderer/setup.html', [
  'id="api-key"',
  'id="confirm"',
  'id="skip"'
]);

for (const file of htmlFiles) {
  const content = fs.readFileSync(path.join(root, file), 'utf8');
  if (content.includes('?/')) {
    console.error(`${file} contains likely mojibake-damaged closing markup.`);
    process.exitCode = 1;
  }
}

if (process.exitCode) process.exit(process.exitCode);
console.log('Project checks passed.');
