import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { validateScoutConfig } from '../src/scout-config.js';
import { resolveConfig } from '../src/config.js';

const scoutBin = fileURLToPath(new URL('../bin/scout.js', import.meta.url));

function config(overrides = {}) {
    return resolveConfig(
        [{ name: 'Scout', objective: 'Gather wood and build a shelter', sandbox: 'none', ...overrides }],
        { env: {}, probeDocker: () => false },
    );
}

test('Scout runtime accepts the single-agent survival configuration', () => {
    const scout = config();
    assert.equal(validateScoutConfig(scout), scout);
});

test('Scout runtime rejects configurations that enable optional features', () => {
    for (const overrides of [
        { gameMode: 'creative' },
        { team: true },
        { peers: ['OtherAgent'] },
        { sandbox: 'local' },
        { vision: true },
        { allowFlight: true },
        { toolsModule: 'custom-tools.js' },
        { sharedMachineSocket: 'shared.sock' },
    ]) {
        assert.throws(() => validateScoutConfig(config(overrides)), /Scout runtime:/);
    }
});

test('Scout executable has its own help and rejects team config before connecting', t => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'scout-runtime-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));

    const help = spawnSync(process.execPath, [scoutBin, '--help'], { cwd, encoding: 'utf8' });
    assert.equal(help.status, 0, help.stderr);
    assert.match(help.stdout, /Run one Minecraft survival agent/);

    const configPath = path.join(cwd, 'team.json');
    writeFileSync(configPath, JSON.stringify({ name: 'Scout', objective: 'test', team: true, sandbox: 'none' }));
    const rejected = spawnSync(process.execPath, [scoutBin, '--config', configPath], { cwd, encoding: 'utf8' });
    assert.equal(rejected.status, 2, rejected.stderr);
    assert.match(rejected.stderr, /team mode is not available/);
    assert.doesNotMatch(rejected.stdout + rejected.stderr, /connecting to/);
});

test('importing the shared agent does not eagerly load optional feature modules', t => {
    const cwd = mkdtempSync(path.join(os.tmpdir(), 'scout-imports-'));
    t.after(() => rmSync(cwd, { recursive: true, force: true }));
    const loaderPath = path.join(cwd, 'deny-optional-loader.mjs');
    writeFileSync(
        loaderPath,
        `export async function resolve(specifier, context, nextResolve) {
            if (/\\/(?:tools\\/(?:workspace-tools|directory-tools|shell-tools|extra-tools|shared-exec)|sandbox\\/(?:shell-sandbox|docker))\\.js$/.test(specifier)) {
                throw new Error('Optional feature imported eagerly: ' + specifier);
            }
            return nextResolve(specifier, context);
        }\n`,
    );
    const agentUrl = new URL('../src/agent.js', import.meta.url).href;
    const imported = spawnSync(
        process.execPath,
        [
            '--no-warnings',
            '--experimental-loader',
            pathToFileURL(loaderPath).href,
            '--input-type=module',
            '-e',
            `await import(${JSON.stringify(agentUrl)})`,
        ],
        { cwd, encoding: 'utf8' },
    );
    assert.equal(imported.status, 0, imported.stderr);
});
