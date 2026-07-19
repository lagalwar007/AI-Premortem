/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_URL: string;
    readonly VITE_API_PORT: string;
    readonly VITE_PROD_API_URL: string;
    readonly VITE_PROD_API_PORT: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
