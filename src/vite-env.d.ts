/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "mainnet" | "chipnet". Unset: chipnet in dev, mainnet in production builds. */
  readonly VITE_NETWORK?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
