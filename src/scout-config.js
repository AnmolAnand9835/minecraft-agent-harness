export function validateScoutConfig(config) {
    const unsupported = [];
    if (config.gameMode !== 'survival') unsupported.push('gameMode must be survival');
    if (config.team || config.peers?.length) unsupported.push('team mode is not available');
    if (config.sandbox?.kind !== 'none') unsupported.push('sandbox must be none');
    if (config.vision) unsupported.push('vision is not available');
    if (config.allowFlight) unsupported.push('flight is not available');
    if (config.toolsModule) unsupported.push('custom tools are not available');
    if (config.sharedMachineSocket || config.sharedMachinePath || config.sharedMachineVm !== undefined)
        unsupported.push('shared-machine settings are not available');

    if (unsupported.length)
        throw Object.assign(new Error(`Scout runtime: ${unsupported.join('; ')}`), { code: 'INVALID_CONFIG' });

    return config;
}
