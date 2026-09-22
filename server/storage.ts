import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const STORAGE_ROOT = path.resolve(process.cwd(), "data", "storage");

function normalizeKey(relKey: string): string {
  return relKey
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
}

function getStoragePath(relKey: string): string {
  const key = normalizeKey(relKey);
  const root = `${STORAGE_ROOT}${path.sep}`;
  const resolved = path.resolve(STORAGE_ROOT, ...key.split("/"));

  if (resolved !== STORAGE_ROOT && !resolved.startsWith(root)) {
    throw new Error("Invalid storage path");
  }

  return resolved;
}

function getExtensionForContentType(contentType: string): string {
  const normalized = contentType.split(";")[0].trim().toLowerCase();

  switch (normalized) {
    case "image/jpeg":
      return ".jpg";

    case "image/png":
      return ".png";

    case "image/webp":
      return ".webp";

    case "image/gif":
      return ".gif";

    case "image/avif":
      return ".avif";

    default:
      return "";
  }
}

function appendHashSuffix(relKey: string, extension = ""): string {
  const hash = crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const lastDot = relKey.lastIndexOf(".");
  const lastSlash = relKey.lastIndexOf("/");

  const hasExtension =
    lastDot > lastSlash && lastDot < relKey.length - 1;

  if (hasExtension) {
    return `${relKey.slice(0, lastDot)}_${hash}${relKey.slice(lastDot)}`;
  }

  return `${relKey}_${hash}${extension}`;
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream",
): Promise<{ key: string; url: string }> {
  const extension = getExtensionForContentType(contentType);
  const key = appendHashSuffix(normalizeKey(relKey), extension);
  const filePath = getStoragePath(key);

  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const fileData =
    typeof data === "string"
      ? Buffer.from(data)
      : Buffer.from(data);

  await fs.writeFile(filePath, fileData);

  return {
    key,
    url: `/storage/${key}`,
  };
}

export async function storageGet(
  relKey: string,
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);

  return {
    key,
    url: `/storage/${key}`,
  };
}

export async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);

  return `/storage/${key}`;
}

export function getLocalStoragePath(relKey: string): string {
  return getStoragePath(relKey);
}

export async function localStorageExists(relKey: string): Promise<boolean> {
  try {
    await fs.access(getStoragePath(relKey));
    return true;
  } catch {
    return false;
  }
}