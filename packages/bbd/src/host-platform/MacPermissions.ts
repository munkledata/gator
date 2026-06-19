import { createRequire } from "node:module";

const nodeRequire = createRequire(import.meta.url);

interface NodeMacPermissions {
    getAuthStatus(type: string): string;
    askForContactsAccess?(): Promise<string>;
    askForFullDiskAccess?(): void;
    askForAccessibilityAccess?(): void;
}

export interface PermissionItem {
    name: string;
    pass: boolean;
}

/**
 * Thin wrapper over `node-mac-permissions` (loaded lazily via createRequire so the
 * typechecked core never statically depends on the native addon). If the addon is
 * unavailable, every permission reports `not determined` / fail instead of throwing —
 * the UI just shows them as "Fail" with a button to grant.
 */
export class MacPermissions {
    #mod: NodeMacPermissions | null | undefined;

    #load(): NodeMacPermissions | null {
        if (this.#mod === undefined) {
            try {
                this.#mod = nodeRequire("node-mac-permissions") as NodeMacPermissions;
            } catch {
                this.#mod = null;
            }
        }
        return this.#mod;
    }

    /** Raw status string ('authorized' | 'denied' | 'not determined' | 'restricted'). */
    status(type: string): string {
        const mod = this.#load();
        if (!mod) return "not determined";
        try {
            return mod.getAuthStatus(type);
        } catch {
            return "not determined";
        }
    }

    /** The list shape the UI renders: [{ name, pass }]. */
    list(): PermissionItem[] {
        return [
            { name: "Full Disk Access", pass: this.status("full-disk-access") === "authorized" },
            { name: "Accessibility", pass: this.status("accessibility") === "authorized" },
            { name: "Contacts", pass: this.status("contacts") === "authorized" }
        ];
    }

    contactStatus(): string {
        return this.status("contacts");
    }

    async requestContacts(): Promise<string> {
        const mod = this.#load();
        try {
            return mod?.askForContactsAccess ? await mod.askForContactsAccess() : this.status("contacts");
        } catch {
            return this.status("contacts");
        }
    }
}
