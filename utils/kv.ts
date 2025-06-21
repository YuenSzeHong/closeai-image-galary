/// <reference lib="deno.unstable" />
// deno-lint-ignore-file no-explicit-any
// utils/kv.ts

// --- Memory KV Implementation ---
function createMemoryKv(): Deno.Kv {
  const storage = new Map<string, any>();
  const expirations = new Map<string, number>();

  const checkExpired = (keyStr: string) => {
    if (expirations.has(keyStr) && Date.now() > expirations.get(keyStr)!) {
      storage.delete(keyStr);
      expirations.delete(keyStr);
      return true;
    }
    return false;
  };

  return {
    async get(key: Deno.KvKey) {
      const keyStr = JSON.stringify(key);
      if (checkExpired(keyStr)) {
        return Promise.resolve({ key, value: null, versionstamp: null });
      }
      const value = storage.get(keyStr);
      return Promise.resolve({
        key,
        value: value === undefined ? null : value,
        versionstamp: value === undefined ? null : "0",
      } as Deno.KvEntryMaybe<any>);
    },

    async set(key: Deno.KvKey, value: any, options?: { expireIn?: number }) {
      const keyStr = JSON.stringify(key);
      storage.set(keyStr, value);
      if (options?.expireIn) {
        expirations.set(keyStr, Date.now() + options.expireIn);
      } else {
        expirations.delete(keyStr);
      }
      return Promise.resolve({
        ok: true,
        versionstamp: "0",
      } as Deno.KvCommitResult);
    },

    async delete(key: Deno.KvKey) {
      const keyStr = JSON.stringify(key);
      storage.delete(keyStr);
      expirations.delete(keyStr);
      return Promise.resolve();
    },

    list: (selector: Deno.KvListSelector) => {
      const selectorWithPrefix = selector as { prefix?: Deno.KvKey };
      const prefixStr = selectorWithPrefix.prefix
        ? JSON.stringify(selectorWithPrefix.prefix).slice(0, -1)
        : "";
      const entries: Array<Deno.KvEntry<any>> = [];
      for (const [keyStr, value] of storage.entries()) {
        if (checkExpired(keyStr)) continue;
        if (keyStr.startsWith(prefixStr)) {
          try {
            entries.push({ key: JSON.parse(keyStr), value, versionstamp: "0" });
          } catch (e) { /* ignore non-json keys */ }
        }
      }
      return {
        [Symbol.asyncIterator]: async function* () {
          for (const entry of entries) yield entry;
        },
        cursor: null,
        next: async () => ({ done: true, value: undefined }),
      } as unknown as Deno.KvListIterator<any>;
    },

    atomic: () => {
      const operations: {
        type: string;
        key: Deno.KvKey;
        value?: any;
        options?: { expireIn?: number };
      }[] = [];
      const opRunner = {
        set: (key: Deno.KvKey, value: any, options?: { expireIn?: number }) => {
          operations.push({ type: "set", key, value, options });
          return opRunner;
        },
        delete: (key: Deno.KvKey) => {
          operations.push({ type: "delete", key });
          return opRunner;
        },
        commit: async () => {
          for (const op of operations) {
            const keyStr = JSON.stringify(op.key);
            if (op.type === "set") {
              storage.set(keyStr, op.value);
              if (op.options?.expireIn) {
                expirations.set(keyStr, Date.now() + op.options.expireIn);
              } else expirations.delete(keyStr);
            } else if (op.type === "delete") {
              storage.delete(keyStr);
              expirations.delete(keyStr);
            }
          }
          return { ok: true, versionstamp: "0" } as Deno.KvCommitResult;
        },
      };
      return opRunner as any;
    },

    close: () => {},
  } as Deno.Kv;
}

// --- KV Instance Management ---
let kvInstance: Deno.Kv | null = null;
let initializationPromise: Promise<Deno.Kv> | null = null;

async function initializeKv(): Promise<Deno.Kv> {
  if (kvInstance) {
    return kvInstance;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      console.log("🔄 尝试连接 Deno KV...");
      kvInstance = await Deno.openKv();
      console.log("✅ Deno KV 连接成功！");
      return kvInstance;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn("⚠️ Deno KV 连接失败，使用内存 KV:", errorMessage);
      kvInstance = createMemoryKv();

      // 在全局对象上共享内存实例，方便其他模块使用
      if (typeof globalThis !== "undefined") {
        (globalThis as { kvMemoryInstance?: Deno.Kv }).kvMemoryInstance = kvInstance;
      }

      console.log("✅ 内存 KV 初始化完成！");
      return kvInstance;
    }
  })();

  return initializationPromise;
}

// --- Export Functions ---
export async function getKv(): Promise<Deno.Kv> {
  return await initializeKv();
}

export function getKvSync(): Deno.Kv | null {
  return kvInstance;
}

export function closeKv(): Promise<void> {
  if (kvInstance) {
    try {
      kvInstance.close();
      console.log("✅ KV 连接已关闭");
    } catch (error) {
      console.warn("⚠️ 关闭 KV 连接时出错:", error);
    }
    kvInstance = null;
    initializationPromise = null;
  }
  return Promise.resolve();
}

// --- Constants ---
export const KV_EXPIRY_STREAM_DATA = 1 * 60 * 60 * 1000; // 1 hour
export const KV_EXPIRY_SSE_STATUS = 2 * 60 * 60 * 1000; // 2 hours
export const MAX_IMAGES_PER_KV_CHUNK = 100;
