const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const templatePath = path.join(__dirname, 'sw.template.js')
const outPath = path.join(root, 'public', 'sw.js')

let buildId
try {
  buildId = execSync('git rev-parse --short HEAD', { encoding: 'utf8', cwd: root }).trim()
} catch {
  buildId = Date.now().toString(36)
}

// Keyed on the commit id so the value is stable for a given build: regenerating
// on every dev/start with the same HEAD produces byte-identical output, so the
// service worker isn't needlessly re-versioned (which would force every tablet to
// reload). A new commit changes buildId, busting the cache on the next deploy.
const cacheVersion = `dc-pos-${pkg.version}-${buildId}`
const token = "'__CACHE_VERSION__'"
const template = fs.readFileSync(templatePath, 'utf8')

// Exactly one placeholder is expected. split/join (not String.replace) so the
// version string is inserted literally — a '$' in it can't trigger replacement
// patterns — and so a stray second token is caught rather than silently shipped.
const occurrences = template.split(token).length - 1
if (occurrences !== 1) {
  console.error(`bump-sw-cache: expected exactly one ${token} in scripts/sw.template.js, found ${occurrences}`)
  process.exit(1)
}
fs.writeFileSync(outPath, template.split(token).join(`'${cacheVersion}'`))
console.log(`bump-sw-cache: public/sw.js -> ${cacheVersion}`)
