/// <reference types="vite/client" />

// Data-URI inliné au build (Vite `?inline`) : les images des PDF sont
// embarquées dans le bundle, sans fetch runtime — indispensable dans la
// WebView Tauri où `fetch('/assets/…')` échoue (« Failed to fetch »).
declare module '*.png?inline' {
  const src: string;
  export default src;
}
