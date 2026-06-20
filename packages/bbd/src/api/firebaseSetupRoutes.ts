import type { FastifyInstance } from "fastify";
import type { FirebaseSetupService } from "../notifications/fcm/FirebaseSetupService";
import { isLoopback } from "./fastifyAdapter";
import { setSecurityHeaders } from "./securityHeaders";

/**
 * The OAuth loopback endpoint for the automatic Firebase setup. Google redirects the
 * browser here (`?code=…&state=…`) after consent; we kick off provisioning in the
 * background — it takes minutes and pushes progress over the socket — and immediately
 * return a small page telling the user they can close the tab. This route is
 * intentionally unauthenticated: it's the public half of the OAuth redirect.
 */
const page = (title: string, body: string): string =>
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>
     <style>body{font-family:-apple-system,system-ui,sans-serif;max-width:30em;margin:4em auto;text-align:center;color:#333}
     h1{font-size:1.4em}</style></head>
     <body><h1>${title}</h1><p>${body}</p></body></html>`;

export function mountFirebaseSetupRoutes(app: FastifyInstance, service: FirebaseSetupService): void {
    app.get("/oauth/callback", async (request, reply) => {
        // Google redirects the local browser to 127.0.0.1, so this only ever needs to
        // answer loopback. Refuse off-host callers (audit S12) so a remote attacker can't
        // submit their own code to hijack the Firebase provisioning, even if the daemon is
        // exposed on a public interface or behind a proxy.
        if (!isLoopback(request.ip)) {
            return reply.status(404).type("text/plain").send("Not found");
        }
        const q = (request.query ?? {}) as { code?: string; state?: string; error?: string };
        reply.header("Content-Type", "text/html; charset=utf-8");
        setSecurityHeaders(reply);

        if (q.error) {
            service.markError(`Google sign-in was cancelled or denied (${q.error}).`);
            return reply.send(page("Setup cancelled", "You can close this window and try again from Gator."));
        }
        if (!q.code || !q.state) {
            return reply.send(page("Something went wrong", "No authorization code was returned. Close this window and retry."));
        }

        // Provisioning runs for minutes; don't block the response on it. Errors are
        // captured into the service's status (surfaced in the app), so swallow here.
        void service.complete(q.code, q.state).catch(() => undefined);
        return reply.send(page("Gator is setting up Firebase…", "You can close this window and return to the app to watch progress."));
    });
}
