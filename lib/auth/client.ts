"use client";

import { createAuthClient } from "@neondatabase/auth/next";

/** Browser-side Neon Auth client; talks to Neon Auth through /api/auth. */
export const authClient = createAuthClient();
