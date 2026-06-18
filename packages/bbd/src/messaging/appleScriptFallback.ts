import type { Logger } from "../core/logger";

/** Runs an AppleScript with positional arguments. Production uses a child-process
 *  `osascript` runner; tests inject a fake. */
export interface AppleScriptRunner {
    run(script: string, args: readonly string[]): Promise<string>;
}

export interface AppleScriptSendInput {
    chatGuid: string;
    text?: string;
}

/**
 * The degraded fallback when the Private API helper isn't injected.
 *
 * Crucially, arguments are passed **positionally** to `osascript` (read from
 * `argv` inside the script), never interpolated into the script body. That
 * eliminates the legacy `escapeOsaExp` / per-line shell re-quoting injection
 * surface. Only the scripting-dictionary `send` survives here; the System-Events
 * GUI-automation path is gone.
 */
export class AppleScriptFallback {
    readonly #runner: AppleScriptRunner;
    readonly #logger: Logger;

    constructor(runner: AppleScriptRunner, logger: Logger) {
        this.#runner = runner;
        this.#logger = logger.child({ component: "AppleScriptFallback" });
    }

    async sendText(input: AppleScriptSendInput): Promise<void> {
        this.#logger.debug(`AppleScript send to ${input.chatGuid}`);
        await this.#runner.run(SEND_TEXT_SCRIPT, [input.chatGuid, input.text ?? ""]);
    }
}

/** Reads chatGuid + message from argv — no interpolation into the script text. */
const SEND_TEXT_SCRIPT = `on run argv
    set chatGuid to item 1 of argv
    set msg to item 2 of argv
    tell application "Messages"
        set targetChat to a reference to chat id chatGuid
        send msg to targetChat
    end tell
end run`;
