import {
  randomBytes,
  randomUUID,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { parse as parseCookieHeader } from "cookie";
import type { Request } from "express";
import { SignJWT, jwtVerify } from "jose";
import type { User } from "../../drizzle/schema";
import * as db from "../db";
import { COOKIE_NAME, SESSION_DURATION_MS } from "@shared/const";
import { ForbiddenError } from "@shared/_core/errors";
import { ENV } from "./env";

const scrypt = promisify(scryptCallback);

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

export type SessionPayload = {
  openId: string;
  name: string;
};

export type AuthenticatedUser = User;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  const salt = randomBytes(SALT_BYTES);
  const derivedKey = (await scrypt(
    password,
    salt,
    KEY_LENGTH,
  )) as Buffer;

  return `scrypt:${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  storedHash: string,
): Promise<boolean> {
  const parts = storedHash.split(":");

  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }

  const salt = Buffer.from(parts[1], "hex");
  const expectedKey = Buffer.from(parts[2], "hex");

  if (salt.length !== SALT_BYTES || expectedKey.length !== KEY_LENGTH) {
    return false;
  }

  const derivedKey = (await scrypt(
    password,
    salt,
    KEY_LENGTH,
  )) as Buffer;

  return timingSafeEqual(derivedKey, expectedKey);
}

export function generateLocalOpenId(): string {
  return `local_${randomUUID()}`;
}

function getSessionSecret() {
  if (!ENV.cookieSecret) {
    throw new Error("JWT_SECRET is not configured");
  }

  return new TextEncoder().encode(ENV.cookieSecret);
}

export async function createSessionToken(
  openId: string,
  options: { expiresInMs?: number; name?: string } = {},
): Promise<string> {
  const issuedAt = Date.now();
  const expiresInMs = options.expiresInMs ?? SESSION_DURATION_MS;
  const expirationSeconds = Math.floor(
    (issuedAt + expiresInMs) / 1000,
  );

  return new SignJWT({
    openId,
    name: options.name || "",
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(getSessionSecret());
}

export async function verifySession(
  cookieValue: string | undefined | null,
): Promise<SessionPayload | null> {
  if (!cookieValue) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(
      cookieValue,
      getSessionSecret(),
      {
        algorithms: ["HS256"],
      },
    );

    const { openId, name } = payload as Record<string, unknown>;

    if (
      typeof openId !== "string" ||
      openId.length === 0 ||
      typeof name !== "string" ||
      name.length === 0
    ) {
      return null;
    }

    return {
      openId,
      name,
    };
  } catch {
    return null;
  }
}

function parseCookies(cookieHeader: string | undefined) {
  if (!cookieHeader) {
    return new Map<string, string>();
  }

  return new Map(
    Object.entries(parseCookieHeader(cookieHeader)),
  );
}

export async function authenticateRequest(
  req: Request,
): Promise<AuthenticatedUser> {
  const cookies = parseCookies(req.headers.cookie);

  let sessionToken = cookies.get(COOKIE_NAME);

  if (!sessionToken) {
    const authHeader = req.headers.authorization;

    if (
      typeof authHeader === "string" &&
      authHeader.startsWith("Bearer ")
    ) {
      sessionToken = authHeader.slice(7);
    }
  }

  const session = await verifySession(sessionToken);

  if (!session) {
    throw ForbiddenError("Invalid session cookie");
  }

  const user = await db.getUserByOpenId(session.openId);

  if (!user) {
    throw ForbiddenError("User not found");
  }

  const signedInAt = new Date();

  await db.upsertUser({
    openId: user.openId,
    lastSignedIn: signedInAt,
  });

  return user;
}
