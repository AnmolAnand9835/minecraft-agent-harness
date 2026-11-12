import { spawnSync } from 'node:child_process';

export function dockerAvailable(bin = 'docker') {
    try {
        return (
            spawnSync(bin, ['info', '--format', '{{.ServerVersion}}'], { timeout: 5000, stdio: 'ignore' }).status === 0
        );
    } catch {
        return false;
    }
}
