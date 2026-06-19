import type DatabaseType from "better-sqlite3";

/**
 * Home-screen stat queries against the read-only chat.db. Each query degrades to a
 * safe empty/zero result if the table/column isn't present (schema drift, or the
 * minimal DBs used in tests), so the UI shows 0 rather than crashing.
 */
export class StatsReader {
    readonly #db: DatabaseType.Database;

    constructor(db: DatabaseType.Database) {
        this.#db = db;
    }

    #safe<T>(fn: () => T, fallback: T): T {
        try {
            return fn();
        } catch {
            return fallback;
        }
    }

    #count(sql: string): number {
        const row = this.#db.prepare(sql).get() as { c?: number } | undefined;
        return Number(row?.c ?? 0);
    }

    /** Total message count — a plain number (the box renders it directly, no transform). */
    messageCount(): number {
        return this.#safe(() => this.#count("SELECT COUNT(*) c FROM message"), 0);
    }

    /** Image attachments — [{ media_count }] (summed by the box). */
    imageCount(): { media_count: number }[] {
        return this.#safe(
            () => [
                {
                    media_count: this.#count(
                        "SELECT COUNT(*) c FROM attachment WHERE mime_type LIKE 'image/%'"
                    )
                }
            ],
            [{ media_count: 0 }]
        );
    }

    videoCount(): { media_count: number }[] {
        return this.#safe(
            () => [
                {
                    media_count: this.#count(
                        "SELECT COUNT(*) c FROM attachment WHERE mime_type LIKE 'video/%'"
                    )
                }
            ],
            [{ media_count: 0 }]
        );
    }

    /** Top group chats by message count — [{ group_name, message_count }]. */
    groupMessageCounts(): { group_name: string; message_count: number }[] {
        return this.#safe(
            () =>
                this.#db
                    .prepare(
                        `SELECT c.display_name AS group_name, COUNT(cmj.message_id) AS message_count
                         FROM chat c
                         JOIN chat_message_join cmj ON cmj.chat_id = c.ROWID
                         WHERE c.display_name IS NOT NULL AND c.display_name != ''
                         GROUP BY c.ROWID
                         ORDER BY message_count DESC
                         LIMIT 25`
                    )
                    .all() as { group_name: string; message_count: number }[],
            []
        );
    }

    /** The most-messaged handle (the "best friend") — a display string. */
    bestFriend(): string {
        return this.#safe(() => {
            const row = this.#db
                .prepare(
                    `SELECT h.id AS id, COUNT(m.ROWID) AS c
                     FROM message m
                     JOIN handle h ON h.ROWID = m.handle_id
                     WHERE m.is_from_me = 0
                     GROUP BY h.ROWID
                     ORDER BY c DESC
                     LIMIT 1`
                )
                .get() as { id?: string } | undefined;
            return row?.id ?? "N/A";
        }, "N/A");
    }
}
