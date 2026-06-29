interface KVNamespace {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
}

interface CloudflareEnv {
  YOBOBA_DATA?: KVNamespace;
}
