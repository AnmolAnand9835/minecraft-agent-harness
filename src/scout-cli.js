import { fileURLToPath } from 'node:url';
import { main } from './cli.js';

const SCOUT_BIN = fileURLToPath(new URL('../bin/scout.js', import.meta.url));

export function scoutMain(argv = process.argv.slice(2)) {
    return main(argv, { runtimeMode: 'scout', entryPoint: SCOUT_BIN });
}
