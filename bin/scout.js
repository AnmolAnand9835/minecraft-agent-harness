#!/usr/bin/env node
import { scoutMain } from '../src/scout-cli.js';

scoutMain().then(
    code => {
        if (code) process.exitCode = code;
    },
    error => {
        console.error(`scout: ${error?.message ?? error}`);
        process.exit(1);
    },
);
