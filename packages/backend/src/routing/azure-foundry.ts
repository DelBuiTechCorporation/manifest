import { normalizeProviderBaseUrl } from './provider-base-url';

/**
 * Azure AI Foundry endpoint URL patterns.
 * - New Foundry projects: {name}.services.ai.azure.com
 * - Classic Azure OpenAI resources: {name}.openai.azure.com
 */
const AZURE_FOUNDRY_RE = /^[a-z0-9][a-z0-9-]*\.services\.ai\.azure\.com$/i;
const AZURE_OPENAI_RE = /^[a-z0-9][a-z0-9-]*\.openai\.azure\.com$/i;

/**
 * Return true if the stored `region` value is a valid Azure endpoint URL.
 * The region column is reused to store the full endpoint URL because Azure
 * resources have user-defined names (unlike Bedrock which has a fixed set
 * of region codes). Value must be https://{name}.services.ai.azure.com or
 * https://{name}.openai.azure.com.
 */
export function isAzureFoundryEndpoint(value: string | null | undefined): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (url.pathname !== '/' && url.pathname !== '') return false;
    return AZURE_FOUNDRY_RE.test(url.hostname) || AZURE_OPENAI_RE.test(url.hostname);
  } catch {
    return false;
  }
}

/**
 * Normalize and validate an Azure endpoint URL the user typed in.
 * Strips a trailing slash. Returns null if the URL is not a valid
 * Azure Foundry or Azure OpenAI endpoint.
 */
export function normalizeAzureFoundryEndpoint(value: string): string | null {
  try {
    const normalized = normalizeProviderBaseUrl(value.trim());
    return isAzureFoundryEndpoint(normalized) ? normalized : null;
  } catch {
    return null;
  }
}

/**
 * True when the given provider id resolves to Azure AI Foundry.
 */
export function isAzureFoundryProvider(provider: string): boolean {
  const lower = provider.toLowerCase().trim();
  return lower === 'azure' || lower === 'azure-openai' || lower === 'azure-ai';
}
