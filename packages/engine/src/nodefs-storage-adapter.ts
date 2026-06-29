import fs from "node:fs";
import path from "node:path";
import type { Chunk, StorageAdapterInterface, StorageKey } from "@automerge/automerge-repo/slim";

/**
 * Filesystem storage adapter for Automerge Repo.
 *
 * This mirrors the upstream NodeFS adapter layout without depending on the
 * upstream package's deprecated `rimraf -> glob@10.5.0` install path.
 */
export class NodeFSStorageAdapter implements StorageAdapterInterface {
  private readonly baseDirectory: string;
  private readonly cache = new Map<string, Uint8Array>();

  constructor(baseDirectory = "automerge-repo-data") {
    this.baseDirectory = baseDirectory;
  }

  async load(keyArray: StorageKey): Promise<Uint8Array | undefined> {
    const key = getKey(keyArray);
    const cached = this.cache.get(key);
    if (cached) return cached;

    try {
      const fileContent = await fs.promises.readFile(this.getFilePath(keyArray));
      return new Uint8Array(fileContent);
    } catch (error) {
      if (isNodeError(error) && error.code === "ENOENT") return undefined;
      throw error;
    }
  }

  async save(keyArray: StorageKey, binary: Uint8Array): Promise<void> {
    this.cache.set(getKey(keyArray), binary);

    const filePath = this.getFilePath(keyArray);
    await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
    await fs.promises.writeFile(filePath, binary);
  }

  async remove(keyArray: StorageKey): Promise<void> {
    this.cache.delete(getKey(keyArray));

    try {
      await fs.promises.unlink(this.getFilePath(keyArray));
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") throw error;
    }
  }

  async loadRange(keyPrefix: StorageKey): Promise<Chunk[]> {
    const dirPath = this.getFilePath(keyPrefix);
    const cachedKeys = this.cachedKeys(keyPrefix);
    const diskFiles = await walkdir(dirPath);
    const diskKeys = diskFiles.map((fileName) => {
      const key = getKey([path.relative(this.baseDirectory, fileName)]);
      return key.slice(0, 2) + key.slice(3);
    });
    const allKeys = [...new Set([...cachedKeys, ...diskKeys])];

    return Promise.all(
      allKeys.map(async (keyString) => {
        const key: StorageKey = keyString.split(path.sep);
        const data = await this.load(key);
        return { data, key };
      }),
    );
  }

  async removeRange(keyPrefix: StorageKey): Promise<void> {
    for (const key of this.cachedKeys(keyPrefix)) {
      this.cache.delete(key);
    }

    await fs.promises.rm(this.getFilePath(keyPrefix), { recursive: true, force: true });
  }

  private cachedKeys(keyPrefix: StorageKey): string[] {
    const cacheKeyPrefixString = getKey(keyPrefix);
    return [...this.cache.keys()].filter((key) => key.startsWith(cacheKeyPrefixString));
  }

  private getFilePath(keyArray: StorageKey): string {
    const [firstKey, ...remainingKeys] = keyArray;
    return path.join(this.baseDirectory, firstKey.slice(0, 2), firstKey.slice(2), ...remainingKeys);
  }
}

function getKey(key: StorageKey): string {
  return path.join(...key);
}

async function walkdir(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const files = await Promise.all(
      entries.map((entry) => {
        const subpath = path.resolve(dirPath, entry.name);
        return entry.isDirectory() ? walkdir(subpath) : subpath;
      }),
    );
    return files.flat();
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") return [];
    throw error;
  }
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
