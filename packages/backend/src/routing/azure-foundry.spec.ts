import {
  isAzureFoundryEndpoint,
  normalizeAzureFoundryEndpoint,
  isAzureFoundryProvider,
} from './azure-foundry';

describe('isAzureFoundryEndpoint', () => {
  it('accepts Azure AI Foundry endpoints', () => {
    expect(isAzureFoundryEndpoint('https://my-project.services.ai.azure.com')).toBe(true);
    expect(isAzureFoundryEndpoint('https://acme-corp.services.ai.azure.com')).toBe(true);
    expect(isAzureFoundryEndpoint('https://a1b2c3.services.ai.azure.com')).toBe(true);
  });

  it('accepts Azure OpenAI classic endpoints', () => {
    expect(isAzureFoundryEndpoint('https://my-resource.openai.azure.com')).toBe(true);
    expect(isAzureFoundryEndpoint('https://myresource.openai.azure.com')).toBe(true);
  });

  it('rejects http endpoints', () => {
    expect(isAzureFoundryEndpoint('http://my-project.services.ai.azure.com')).toBe(false);
    expect(isAzureFoundryEndpoint('http://my-resource.openai.azure.com')).toBe(false);
  });

  it('rejects non-Azure domains', () => {
    expect(isAzureFoundryEndpoint('https://api.openai.com')).toBe(false);
    expect(isAzureFoundryEndpoint('https://example.com')).toBe(false);
    expect(isAzureFoundryEndpoint('https://malicious.services.ai.azure.com.evil.com')).toBe(false);
  });

  it('rejects endpoints with credentials', () => {
    expect(isAzureFoundryEndpoint('https://user:pass@my-project.services.ai.azure.com')).toBe(
      false,
    );
  });

  it('rejects endpoints with explicit port', () => {
    expect(isAzureFoundryEndpoint('https://my-project.services.ai.azure.com:443')).toBe(false);
  });

  it('rejects null, undefined, and non-string values', () => {
    expect(isAzureFoundryEndpoint(null)).toBe(false);
    expect(isAzureFoundryEndpoint(undefined)).toBe(false);
  });

  it('rejects invalid URLs', () => {
    expect(isAzureFoundryEndpoint('not-a-url')).toBe(false);
    expect(isAzureFoundryEndpoint('')).toBe(false);
  });
});

describe('normalizeAzureFoundryEndpoint', () => {
  it('returns normalized endpoint for valid Foundry URL', () => {
    expect(normalizeAzureFoundryEndpoint('https://my-project.services.ai.azure.com')).toBe(
      'https://my-project.services.ai.azure.com',
    );
  });

  it('strips trailing slash', () => {
    expect(normalizeAzureFoundryEndpoint('https://my-project.services.ai.azure.com/')).toBe(
      'https://my-project.services.ai.azure.com',
    );
  });

  it('returns null for invalid URLs', () => {
    expect(normalizeAzureFoundryEndpoint('http://my-project.services.ai.azure.com')).toBeNull();
    expect(normalizeAzureFoundryEndpoint('https://example.com')).toBeNull();
    expect(normalizeAzureFoundryEndpoint('not-a-url')).toBeNull();
  });
});

describe('isAzureFoundryProvider', () => {
  it('matches azure and its aliases', () => {
    expect(isAzureFoundryProvider('azure')).toBe(true);
    expect(isAzureFoundryProvider('Azure')).toBe(true);
    expect(isAzureFoundryProvider('AZURE')).toBe(true);
    expect(isAzureFoundryProvider('azure-openai')).toBe(true);
    expect(isAzureFoundryProvider('azure-ai')).toBe(true);
  });

  it('rejects unrelated providers', () => {
    expect(isAzureFoundryProvider('openai')).toBe(false);
    expect(isAzureFoundryProvider('anthropic')).toBe(false);
    expect(isAzureFoundryProvider('bedrock')).toBe(false);
  });
});
