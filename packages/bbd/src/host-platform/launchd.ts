import path from "node:path";

/**
 * launchd LaunchAgent management — how `bbd` runs after Electron is gone.
 *
 * Critically a **LaunchAgent** (per-user, `gui/<uid>` domain), NOT a system
 * `LaunchDaemon`: TCC grants (Full-Disk-Access, Automation) and the keychain only
 * resolve for an agent in the user's Aqua GUI session. `KeepAlive` lets launchd
 * supervise the daemon, decoupling bridge uptime from any GUI window.
 */

export interface LaunchAgentConfig {
    /** Reverse-DNS label, e.g. "app.bluebubbles.bbd". */
    label: string;
    /** Absolute path to the daemon executable. */
    programPath: string;
    args?: readonly string[];
    keepAlive?: boolean;
    runAtLoad?: boolean;
    stdoutPath?: string;
    stderrPath?: string;
    /** Extra environment for the agent. */
    environment?: Record<string, string>;
}

function plistArray(values: readonly string[]): string {
    return ["<array>", ...values.map(v => `        <string>${escapeXml(v)}</string>`), "    </array>"].join("\n");
}

function plistDict(entries: Record<string, string>): string {
    const lines = Object.entries(entries).flatMap(([k, v]) => [
        `        <key>${escapeXml(k)}</key>`,
        `        <string>${escapeXml(v)}</string>`
    ]);
    return ["<dict>", ...lines, "    </dict>"].join("\n");
}

function escapeXml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Generate the LaunchAgent plist XML for the given config. */
export function generateLaunchAgentPlist(config: LaunchAgentConfig): string {
    const programArguments = [config.programPath, ...(config.args ?? [])];
    const rows: string[] = [
        `    <key>Label</key>\n    <string>${escapeXml(config.label)}</string>`,
        `    <key>ProgramArguments</key>\n    ${plistArray(programArguments)}`,
        `    <key>RunAtLoad</key>\n    <${config.runAtLoad === false ? "false" : "true"}/>`,
        `    <key>KeepAlive</key>\n    <${config.keepAlive === false ? "false" : "true"}/>`
    ];
    if (config.stdoutPath) rows.push(`    <key>StandardOutPath</key>\n    <string>${escapeXml(config.stdoutPath)}</string>`);
    if (config.stderrPath) rows.push(`    <key>StandardErrorPath</key>\n    <string>${escapeXml(config.stderrPath)}</string>`);
    if (config.environment) rows.push(`    <key>EnvironmentVariables</key>\n    ${plistDict(config.environment)}`);

    return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${rows.join("\n")}
</dict>
</plist>
`;
}

export interface LaunchctlRunner {
    run(args: readonly string[]): Promise<void>;
}

export interface LaunchAgentManagerDeps {
    /** Typically ~/Library/LaunchAgents. */
    agentDir: string;
    uid: number;
    writeFile: (filePath: string, content: string) => Promise<void>;
    removeFile: (filePath: string) => Promise<void>;
    launchctl: LaunchctlRunner;
}

/** Installs/uninstalls the LaunchAgent (plist write + launchctl bootstrap/bootout). */
export class LaunchAgentManager {
    readonly #deps: LaunchAgentManagerDeps;

    constructor(deps: LaunchAgentManagerDeps) {
        this.#deps = deps;
    }

    plistPath(label: string): string {
        return path.join(this.#deps.agentDir, `${label}.plist`);
    }

    async install(config: LaunchAgentConfig): Promise<void> {
        const plistPath = this.plistPath(config.label);
        await this.#deps.writeFile(plistPath, generateLaunchAgentPlist(config));
        await this.#deps.launchctl.run(["bootstrap", `gui/${this.#deps.uid}`, plistPath]);
    }

    async uninstall(label: string): Promise<void> {
        const plistPath = this.plistPath(label);
        await this.#deps.launchctl.run(["bootout", `gui/${this.#deps.uid}/${label}`]);
        await this.#deps.removeFile(plistPath);
    }
}
