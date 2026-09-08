/** Register the peer-stub resolve hook for node:test runs. */

import { register } from 'node:module'

register(new URL('./loader.mjs', import.meta.url))
