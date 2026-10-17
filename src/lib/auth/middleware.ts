import { createMiddleware } from "@tanstack/react-start";

/** Server-function auth: forwards the Lovable Cloud access token and verifies it server-side. */
export const authMiddleware = createMiddleware({ type: "function" })
  .client(async ({ next }) => {
    const { getFreshBearerToken } = await import("./client");
    const token = await getFreshBearerToken();
    return next({
      sendContext: { bearerToken: token ?? undefined },
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  })
  .server(async ({ next, context }) => {
    const { requireUserId } = await import("./verify.server");
    const userId = await requireUserId((context as { bearerToken?: string }).bearerToken);
    return next({ context: { userId } });
  });
