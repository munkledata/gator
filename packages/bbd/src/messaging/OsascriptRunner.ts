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
            // Writing the script to stdin can throw EPIPE if the child died before reading it
            // (e.g. osascript not found / killed). Without a listener that error is unhandled
            // and crashes the process; route it to reject() so the caller sees a normal failure.
            child.stdin?.on("error", reject);
            try {
                child.stdin?.end(script);
            } catch (e) {
                reject(e instanceof Error ? e : new Error(String(e)));
            }
        });
    }
}
