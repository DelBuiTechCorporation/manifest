import { ProviderService } from '../provider.service';
import { TenantProvider } from '../../../entities/tenant-provider.entity';
import { TierAssignment } from '../../../entities/tier-assignment.entity';
import { SpecificityAssignment } from '../../../entities/specificity-assignment.entity';
import { Agent } from '../../../entities/agent.entity';
import { HeaderTier } from '../../../entities/header-tier.entity';
import type { Repository } from 'typeorm';
import type { RoutingCacheService } from '../routing-cache.service';
import type { ModelPricingCacheService } from '../../../model-prices/model-pricing-cache.service';
import { encrypt, getEncryptionSecret } from '../../../common/utils/crypto.util';

jest.mock('../../qwen-region', () => {
  const actual = jest.requireActual('../../qwen-region');
  return { ...actual, detectQwenRegion: jest.fn() };
});


const { detectQwenRegion } = jest.requireMock('../../qwen-region') as {
  detectQwenRegion: jest.Mock;
};

const makeRepo = () => ({
  find: jest.fn().mockResolvedValue([]),
  findOne: jest.fn().mockResolvedValue(null),
  save: jest.fn().mockImplementation(async (rows) => rows),
  remove: jest.fn().mockResolvedValue(undefined),
  manager: { transaction: jest.fn() },
  createQueryBuilder: jest.fn().mockReturnValue({
    leftJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    getRawMany: jest.fn().mockResolvedValue([{ id: 'agent-1' }]),
  }),
});

describe('ProviderService — Qwen region resolution', () => {
  let svc: ProviderService;
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(48);
    detectQwenRegion.mockReset();
    svc = new ProviderService(
      makeRepo() as unknown as Repository<TenantProvider>,
      makeRepo() as unknown as Repository<TierAssignment>,
      makeRepo() as unknown as Repository<SpecificityAssignment>,
      makeRepo() as unknown as Repository<Agent>,
      makeRepo() as unknown as Repository<HeaderTier>,
      { getByModel: jest.fn() } as unknown as ModelPricingCacheService,
      {
        invalidateAgent: jest.fn(),
        invalidateTenant: jest.fn(),
      } as unknown as RoutingCacheService,
    );
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = originalSecret;
  });

  const resolve = (
    region: string | undefined,
    apiKey: string | undefined,
    existing: Partial<TenantProvider> | null = null,
  ): Promise<string | null> =>
    (
      svc as unknown as {
        resolveProviderRegion: (
          p: string,
          a: string,
          r: string | undefined,
          k: string | undefined,
          e: TenantProvider | null,
        ) => Promise<string | null>;
      }
    ).resolveProviderRegion('qwen', 'api_key', region, apiKey, existing as TenantProvider | null);

  it('detects the region from a supplied api key when no region is requested', async () => {
    detectQwenRegion.mockResolvedValue('singapore');
    expect(await resolve(undefined, 'sk-xxx')).toBe('singapore');
  });

  it('keeps an existing resolved region when neither region nor key is given', async () => {
    expect(await resolve(undefined, undefined, { region: 'us' })).toBe('us');
    expect(await resolve(undefined, undefined, null)).toBeNull();
  });

  it('rejects an invalid requested region', async () => {
    await expect(resolve('mars', undefined)).rejects.toThrow('Qwen region must be one of');
  });

  it('returns a concrete requested region unchanged', async () => {
    expect(await resolve('singapore', undefined)).toBe('singapore');
  });

  it('auto-detects using a decrypted stored key', async () => {
    detectQwenRegion.mockResolvedValue('beijing');
    const encrypted = encrypt('stored-key', getEncryptionSecret());
    expect(await resolve('auto', undefined, { api_key_encrypted: encrypted })).toBe('beijing');
  });

  it('auto-detect falls back to the existing region when the stored key cannot be decrypted', async () => {
    expect(await resolve('auto', undefined, { region: 'us', api_key_encrypted: 'garbage' })).toBe(
      'us',
    );
  });

  it('throws when auto-detection yields no region', async () => {
    detectQwenRegion.mockResolvedValue(null);
    await expect(resolve('auto', 'sk-xxx')).rejects.toThrow('Could not auto-detect');
  });
});

describe('ProviderService — Azure AI Foundry region resolution', () => {
  let svc: ProviderService;
  let originalSecret: string | undefined;

  beforeEach(() => {
    originalSecret = process.env.BETTER_AUTH_SECRET;
    process.env.BETTER_AUTH_SECRET = 'a'.repeat(48);
    svc = new ProviderService(
      makeRepo() as unknown as Repository<TenantProvider>,
      makeRepo() as unknown as Repository<TierAssignment>,
      makeRepo() as unknown as Repository<SpecificityAssignment>,
      makeRepo() as unknown as Repository<Agent>,
      makeRepo() as unknown as Repository<HeaderTier>,
      { getByModel: jest.fn() } as unknown as ModelPricingCacheService,
      {
        invalidateAgent: jest.fn(),
        invalidateTenant: jest.fn(),
      } as unknown as RoutingCacheService,
    );
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.BETTER_AUTH_SECRET;
    else process.env.BETTER_AUTH_SECRET = originalSecret;
  });

  const resolve = (
    region: string | undefined,
    existing: Partial<TenantProvider> | null = null,
  ): Promise<string | null> =>
    (
      svc as unknown as {
        resolveProviderRegion: (
          p: string,
          a: string,
          r: string | undefined,
          k: string | undefined,
          e: TenantProvider | null,
        ) => Promise<string | null>;
      }
    ).resolveProviderRegion('azure', 'api_key', region, undefined, existing as TenantProvider | null);

  it('returns the normalized Foundry endpoint URL when provided', async () => {
    expect(await resolve('https://myproject.services.ai.azure.com/')).toBe(
      'https://myproject.services.ai.azure.com',
    );
  });

  it('accepts classic Azure OpenAI endpoint URLs', async () => {
    expect(await resolve('https://myresource.openai.azure.com')).toBe(
      'https://myresource.openai.azure.com',
    );
  });

  it('returns the existing endpoint when no region is requested and the stored one is valid', async () => {
    expect(
      await resolve(undefined, { region: 'https://myproject.services.ai.azure.com' }),
    ).toBe('https://myproject.services.ai.azure.com');
  });

  it('returns null when no region is requested and no valid endpoint is stored', async () => {
    expect(await resolve(undefined, null)).toBeNull();
    expect(await resolve(undefined, { region: null })).toBeNull();
  });

  it('throws BadRequestException for an invalid endpoint URL', async () => {
    await expect(resolve('http://insecure.services.ai.azure.com')).rejects.toThrow(
      'Azure AI Foundry endpoint must be a valid HTTPS URL',
    );
    await expect(resolve('https://api.openai.com')).rejects.toThrow(
      'Azure AI Foundry endpoint must be a valid HTTPS URL',
    );
  });
});
