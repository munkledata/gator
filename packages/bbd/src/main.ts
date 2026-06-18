import { startBbdBackend } from "./backend";

/**
 * Headless entrypoint — no Electron. Boots the full backend with default paths and
 * waits on the supervised {@link Daemon}. The Electron shell uses {@link file://./daemon-entry.ts}
 * instead, which injects the host's paths/port and the bundled UI directory.
 */
startBbdBackend().catch(err => {
    console.error("bbd failed to start:", err);
    process.exit(1);
});
