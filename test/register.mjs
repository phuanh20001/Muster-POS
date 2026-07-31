// Bootstrap for `node --import`: registers the @/ alias resolver hook.
import { register } from 'node:module'

register('./alias-loader.mjs', import.meta.url)
