/** Encore's backend (Cloudflare Worker). Set VITE_API_URL to override, or '' to run fully local. */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) ?? 'https://encore-api.kadenremains.workers.dev';
