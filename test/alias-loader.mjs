// Lets `node --test` resolve the `@/` path alias the same way Next/webpack does
// (jsconfig.json maps `@/*` -> `src/*`), so unit tests can import app modules
// with their real specifiers. Registered via test/register.mjs; no test-only
// changes to production import paths.
import { pathToFileURL } from 'node:url'
import { dirname, resolve as pathResolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = pathResolve(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = pathToFileURL(pathResolve(projectRoot, 'src') + '/').href

export async function resolve(specifier, context, next) {
  if (specifier.startsWith('@/')) {
    let rel = specifier.slice(2)
    if (!/\.[a-z]+$/i.test(rel)) rel += '.js'
    return { url: new URL(rel, SRC).href, shortCircuit: true }
  }
  return next(specifier, context)
}
