import { execFile } from "node:child_process";
import type { AppleScriptRunner } from "./appleScriptFallback";

/**
 * Runs AppleScript via `osascript - <arg…>`: the script is fed on **stdin** and the
 * arguments are passed **positionally** (read from `argv` in the script). Nothing is
 * interpolated into the script text or a shell command line, so there is no
 * injection surface — the legacy `escapeOsaExp`/shell-requote path is gone.
 */
export class OsascriptRunner implements AppleScriptRunner {
    run(script: string, args: readonly string[]): Promise<string> {
        return new Promise<string>((resolve, reject) => {
            const child = execFile("osascript", ["-", ...args], { timeout: 30_000 }, (err, stdout, stderr) => {
                if (err) reject(new Error(stderr?.trim() || err.message));
                else resolve(stdout);
            });
            child.stdin?.end(script);
        });
    }
}
