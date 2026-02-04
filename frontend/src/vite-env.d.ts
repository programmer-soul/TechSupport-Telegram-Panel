/// <reference types="vite/client" />

interface ImportMetaEnv {}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

interface Window {
  onTelegramAuth?: (user: any) => void
}
