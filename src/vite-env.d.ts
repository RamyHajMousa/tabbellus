/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DEV_ENTITLEMENT?: 'pro' | 'free';
  readonly VITE_CRX_PUBLIC_KEY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
