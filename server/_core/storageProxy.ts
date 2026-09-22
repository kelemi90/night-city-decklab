import type { Express } from "express";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { authenticateRequest } from "./localAuth";
import { getLocalStoragePath } from "../storage";

function getContentType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".avif":
      return "image/avif";
    default:
      return "application/octet-stream";
  }
}

export function registerStorageProxy(app: Express) {
  app.get("/storage/*", async (req, res) => {
    const key = (req.params as Record<string, string>)[0];

    if (!key) {
      res.status(400).send("Missing storage key");
      return;
    }

    // Personal scan objects are stored under `<userId>/scans/...`.
    // Require the same authenticated owner before serving the image.
    const scanOwner = key.match(/^(\d+)\/scans\//)?.[1];

    if (scanOwner) {
      try {
        const user = await authenticateRequest(req);

        if (!user || String(user.id) !== scanOwner) {
          res.status(403).send("Forbidden");
          return;
        }
      } catch {
        res.status(401).send("Authentication required");
        return;
      }
    }

    try {
      const filePath = getLocalStoragePath(key);
      const fileStat = await stat(filePath);

      if (!fileStat.isFile()) {
        res.status(404).send("Storage object not found");
        return;
      }

      res.setHeader("Content-Type", getContentType(filePath));
      res.setHeader("Content-Length", String(fileStat.size));
      res.setHeader("Cache-Control", "private, no-store");
      res.setHeader("X-Content-Type-Options", "nosniff");

      createReadStream(filePath).pipe(res);
    } catch (err: unknown) {
      const error = err as NodeJS.ErrnoException;

      if (error.code === "ENOENT") {
        res.status(404).send("Storage object not found");
        return;
      }

      console.error("[StorageProxy] failed:", err);
      res.status(500).send("Storage error");
    }
  });
}
