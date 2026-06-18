import fs from "node:fs";
import path from "node:path";
import { type Cursor, INITIAL_CURSOR } from "./cursor";
import type { CursorStore } from "./IMessageListener";

/**
 * Persists the detection cursor to a JSON file, so a restart resumes exactly where
 * it left off. A missing/corrupt file resets to the initial cursor (a one-time
 * backfill), never a crash.
 */
export class FileCursorStore implements CursorStore {
    readonly #path: string;

    constructor(filePath: string) {
        this.#path = filePath;
    }

    async load(): Promise<Cursor> {
        try {
            const parsed = JSON.parse(fs.readFileSync(this.#path, "utf8")) as Partial<Cursor>;
            return { ...INITIAL_CURSOR, ...parsed };
        } catch {
            return INITIAL_CURSOR;
        }
    }

    async save(cursor: Cursor): Promise<void> {
        fs.mkdirSync(path.dirname(this.#path), { recursive: true });
        fs.writeFileSync(this.#path, JSON.stringify(cursor));
    }
}
