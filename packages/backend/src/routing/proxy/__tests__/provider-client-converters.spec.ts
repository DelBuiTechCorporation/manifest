import {
  createReasoningContentStreamTransformer,
  isOpenAiReasoningModelName,
  sanitizeOpenAiBody,
} from '../provider-client-converters';

describe('provider-client-converters', () => {
  describe('isOpenAiReasoningModelName', () => {
    it('matches gpt-5 / o-series, bare and vendor-prefixed', () => {
      expect(isOpenAiReasoningModelName('gpt-5.5')).toBe(true);
      expect(isOpenAiReasoningModelName('o3-mini')).toBe(true);
      // vendor-prefixed: the prefix is stripped before matching.
      expect(isOpenAiReasoningModelName('openai/gpt-5.3-codex')).toBe(true);
    });

    it('does not match non-reasoning families', () => {
      expect(isOpenAiReasoningModelName('gpt-4o')).toBe(false);
      expect(isOpenAiReasoningModelName('grok-4.3')).toBe(false);
      expect(isOpenAiReasoningModelName('anthropic/claude-sonnet-4')).toBe(false);
    });
  });

  describe('sanitizeOpenAiBody', () => {
    /* ── Top-level field stripping ── */

    it('should pass through all fields for openai provider', () => {
      const body = {
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'gpt-4o',
        store: true,
        metadata: { key: 'value' },
        stream_options: { include_usage: true },
      };

      const result = sanitizeOpenAiBody(body, 'openai', 'gpt-4o');

      expect(result).toHaveProperty('store');
      expect(result).toHaveProperty('metadata');
      expect(result).toHaveProperty('stream_options');
    });

    it('should strip OpenAI-only fields for non-passthrough providers', () => {
      const body = {
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'mistral-large',
        store: true,
        metadata: {},
        service_tier: 'auto',
        stream_options: {},
        modalities: ['text'],
        audio: {},
        prediction: {},
        reasoning_effort: 'medium',
        temperature: 0.5,
      };

      const result = sanitizeOpenAiBody(body, 'mistral', 'mistral-large');

      expect(result).not.toHaveProperty('store');
      expect(result).not.toHaveProperty('metadata');
      expect(result).not.toHaveProperty('service_tier');
      expect(result).not.toHaveProperty('stream_options');
      expect(result).not.toHaveProperty('modalities');
      expect(result).not.toHaveProperty('audio');
      expect(result).not.toHaveProperty('prediction');
      expect(result).not.toHaveProperty('reasoning_effort');
      expect(result).toHaveProperty('temperature', 0.5);
    });

    it('should convert max_completion_tokens to max_tokens for non-passthrough providers', () => {
      const body = {
        messages: [],
        max_completion_tokens: 1000,
      };

      const result = sanitizeOpenAiBody(body, 'anthropic', 'claude-3');

      expect(result).toHaveProperty('max_tokens', 1000);
      expect(result).not.toHaveProperty('max_completion_tokens');
    });

    it('should not overwrite existing max_tokens with max_completion_tokens', () => {
      const body = {
        messages: [],
        max_tokens: 500,
        max_completion_tokens: 1000,
      };

      const result = sanitizeOpenAiBody(body, 'anthropic', 'claude-3');

      expect(result.max_tokens).toBe(500);
    });

    it('should pass through openrouter as passthrough provider', () => {
      const body = {
        messages: [],
        store: true,
        metadata: { test: 1 },
      };

      const result = sanitizeOpenAiBody(body, 'openrouter', 'openai/gpt-4o');

      expect(result).toHaveProperty('store');
      expect(result).toHaveProperty('metadata');
    });

    /* ── DeepSeek max_tokens normalization ── */

    it('should cap max_tokens at 8192 for deepseek provider', () => {
      const body = { messages: [], max_tokens: 16000 };

      const result = sanitizeOpenAiBody(body, 'deepseek', 'deepseek-chat');

      expect(result.max_tokens).toBe(8192);
    });

    it('should truncate fractional max_tokens for deepseek', () => {
      const body = { messages: [], max_tokens: 5000.7 };

      const result = sanitizeOpenAiBody(body, 'deepseek', 'deepseek-chat');

      expect(result.max_tokens).toBe(5000);
    });

    it('should delete max_tokens when 0 for deepseek', () => {
      const body = { messages: [], max_tokens: 0 };

      const result = sanitizeOpenAiBody(body, 'deepseek', 'deepseek-chat');

      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should delete max_tokens when negative for deepseek', () => {
      const body = { messages: [], max_tokens: -100 };

      const result = sanitizeOpenAiBody(body, 'deepseek', 'deepseek-chat');

      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should handle string max_tokens for deepseek', () => {
      const body = { messages: [], max_tokens: '4096' as unknown };

      const result = sanitizeOpenAiBody(body as any, 'deepseek', 'deepseek-chat');

      expect(result.max_tokens).toBe(4096);
    });

    it('should delete non-finite max_tokens for deepseek', () => {
      const body = { messages: [], max_tokens: 'not-a-number' as unknown };

      const result = sanitizeOpenAiBody(body as any, 'deepseek', 'deepseek-chat');

      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should delete max_tokens that truncates to 0 for deepseek', () => {
      const body = { messages: [], max_tokens: 0.5 };

      const result = sanitizeOpenAiBody(body, 'deepseek', 'deepseek-chat');

      expect(result).not.toHaveProperty('max_tokens');
    });

    /* ── Message sanitization: reasoning_content ── */

    it('should strip reasoning_content for non-deepseek providers', () => {
      const body = {
        messages: [{ role: 'assistant', content: 'Hi', reasoning_content: 'I thought...' }],
      };

      const result = sanitizeOpenAiBody(body, 'anthropic', 'claude-3');
      const messages = result.messages as any[];

      expect(messages[0]).not.toHaveProperty('reasoning_content');
    });

    it('should preserve reasoning_content for deepseek provider', () => {
      const body = {
        messages: [{ role: 'assistant', content: 'Hi', reasoning_content: 'thought' }],
      };

      const result = sanitizeOpenAiBody(body, 'deepseek', 'deepseek-chat');
      const messages = result.messages as any[];

      expect(messages[0]).toHaveProperty('reasoning_content', 'thought');
    });

    it('normalizes provider casing when preserving reasoning_content', () => {
      const body = {
        messages: [{ role: 'assistant', content: 'Hi', reasoning_content: 'thought' }],
      };

      const result = sanitizeOpenAiBody(body, 'DeepSeek', 'deepseek-chat');
      const messages = result.messages as any[];

      expect(messages[0]).toHaveProperty('reasoning_content', 'thought');
    });

    it('should preserve reasoning_content for native moonshot provider', () => {
      const body = {
        messages: [{ role: 'assistant', content: 'Hi', reasoning_content: 'thought' }],
      };

      const result = sanitizeOpenAiBody(body, 'moonshot', 'kimi-k2');
      const messages = result.messages as any[];

      expect(messages[0]).toHaveProperty('reasoning_content', 'thought');
    });

    it('should preserve reasoning_content for openrouter deepseek models', () => {
      const body = {
        messages: [{ role: 'assistant', content: 'Hi', reasoning_content: 'thought' }],
      };

      const result = sanitizeOpenAiBody(body, 'openrouter', 'deepseek/deepseek-r1');
      const messages = result.messages as any[];

      expect(messages[0]).toHaveProperty('reasoning_content', 'thought');
    });

    it('should preserve reasoning_content for openrouter moonshot models', () => {
      const body = {
        messages: [{ role: 'assistant', content: 'Hi', reasoning_content: 'thought' }],
      };

      const result = sanitizeOpenAiBody(body, 'openrouter', 'moonshotai/kimi-k2');
      const messages = result.messages as any[];

      expect(messages[0]).toHaveProperty('reasoning_content', 'thought');
    });

    it('should strip reasoning_content for non-deepseek openrouter models', () => {
      const body = {
        messages: [{ role: 'assistant', content: 'Hi', reasoning_content: 'thought' }],
      };

      const result = sanitizeOpenAiBody(body, 'openrouter', 'openai/gpt-4o');
      const messages = result.messages as any[];

      expect(messages[0]).not.toHaveProperty('reasoning_content');
    });

    it('should preserve reasoning_content for opencode-go deepseek models (issue #1862)', () => {
      // OpenCode Go's subscription proxies forward DeepSeek requests to the
      // upstream DeepSeek API, which enforces "reasoning_content must be
      // passed back" on every thinking-mode follow-up turn.
      const body = {
        messages: [
          { role: 'user', content: 'hello' },
          { role: 'assistant', content: 'hi', reasoning_content: 'I considered...' },
          { role: 'user', content: 'continue' },
        ],
      };

      const result = sanitizeOpenAiBody(body, 'opencode-go', 'opencode-go/deepseek-v4-pro');
      const messages = result.messages as any[];

      expect(messages[1]).toHaveProperty('reasoning_content', 'I considered...');
    });

    it('should preserve reasoning_content for opencode-go reasoning model families', () => {
      const body = {
        messages: [
          { role: 'user', content: 'x' },
          {
            role: 'assistant',
            content: '',
            reasoning_content: 'thinking',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'foo', arguments: '{}' },
              },
            ],
          },
          { role: 'tool', tool_call_id: 'call_1', content: '{}' },
        ],
      };

      for (const model of [
        'opencode-go/kimi-k2.6',
        'opencode-go/glm-5.1',
        'opencode-go/qwen3.6-plus',
        'opencode-go/minimax-m2.7',
        'opencode-go/mimo-v2.5',
      ]) {
        const result = sanitizeOpenAiBody(body, 'opencode-go', model);
        const messages = result.messages as any[];

        expect(messages[1]).toHaveProperty('reasoning_content', 'thinking');
      }
    });

    it('should strip reasoning_content for unknown opencode-go model families', () => {
      const body = {
        messages: [{ role: 'assistant', content: 'Hi', reasoning_content: 'thought' }],
      };

      const result = sanitizeOpenAiBody(body, 'opencode-go', 'opencode-go/claude-sonnet-4');
      const messages = result.messages as any[];

      expect(messages[0]).not.toHaveProperty('reasoning_content');
    });

    it('should preserve reasoning_content for custom providers proxying DeepSeek', () => {
      // proxy-fallback.service strips the "custom:<uuid>/" prefix before
      // calling ProviderClient.forward, so in production sanitizeOpenAiBody
      // sees the already-bare model id.
      const body = {
        messages: [{ role: 'assistant', content: 'Hi', reasoning_content: 'thought' }],
      };

      const result = sanitizeOpenAiBody(body, 'custom', 'deepseek-reasoner');
      const messages = result.messages as any[];

      expect(messages[0]).toHaveProperty('reasoning_content', 'thought');
    });

    it('should match deepseek family models case-insensitively', () => {
      const body = {
        messages: [{ role: 'assistant', content: 'Hi', reasoning_content: 'thought' }],
      };

      const result = sanitizeOpenAiBody(body, 'opencode-go', 'opencode-go/DeepSeek-V4-Pro');
      const messages = result.messages as any[];

      expect(messages[0]).toHaveProperty('reasoning_content', 'thought');
    });

    it('should strip reasoning_content for deepseek-derived slugs on strict OpenAI endpoints', () => {
      // Community distillations carry the DeepSeek name but are hosted by
      // providers that may not implement DeepSeek's echo contract and may
      // reject unknown message fields. The endpoint allowlist excludes
      // them — substring-match alone is not enough.
      for (const endpointKey of ['mistral', 'anthropic', 'openai']) {
        const body = {
          messages: [{ role: 'assistant', content: 'Hi', reasoning_content: 'thought' }],
        };
        const result = sanitizeOpenAiBody(body, endpointKey, 'deepseek-r1-distill-llama-70b');
        const messages = result.messages as any[];
        expect(messages[0]).not.toHaveProperty('reasoning_content');
      }
    });

    it('re-injects cached reasoning_content for compatible assistant tool-call messages', () => {
      const body = {
        messages: [
          {
            role: 'assistant',
            content: '',
            tool_calls: [
              {
                id: 'call_1',
                type: 'function',
                function: { name: 'lookup', arguments: '{}' },
              },
            ],
          },
        ],
      };

      const lookup = jest.fn((id: string) => (id === 'call_1' ? 'cached reasoning' : null));
      const result = sanitizeOpenAiBody(body, 'deepseek', 'deepseek-chat', lookup);
      const messages = result.messages as any[];

      expect(lookup).toHaveBeenCalledWith('call_1');
      expect(messages[0]).toHaveProperty('reasoning_content', 'cached reasoning');
    });

    it('does not re-inject cached reasoning_content for strict providers', () => {
      const body = {
        messages: [
          {
            role: 'assistant',
            content: '',
            tool_calls: [{ id: 'call_1', type: 'function', function: {} }],
          },
        ],
      };

      const lookup = jest.fn(() => 'cached reasoning');
      const result = sanitizeOpenAiBody(body, 'mistral', 'mistral-large', lookup);
      const messages = result.messages as any[];

      expect(lookup).not.toHaveBeenCalled();
      expect(messages[0]).not.toHaveProperty('reasoning_content');
    });

    it('does not replace existing reasoning_content during re-injection', () => {
      const body = {
        messages: [
          {
            role: 'assistant',
            content: '',
            reasoning_content: 'client reasoning',
            tool_calls: [{ id: 'call_1', type: 'function', function: {} }],
          },
        ],
      };

      const lookup = jest.fn(() => 'cached reasoning');
      const result = sanitizeOpenAiBody(body, 'deepseek', 'deepseek-chat', lookup);
      const messages = result.messages as any[];

      expect(lookup).not.toHaveBeenCalled();
      expect(messages[0]).toHaveProperty('reasoning_content', 'client reasoning');
    });

    it('does not re-inject cached reasoning_content without tool calls', () => {
      const body = {
        messages: [{ role: 'assistant', content: 'Hi' }],
      };

      const lookup = jest.fn(() => 'cached reasoning');
      const result = sanitizeOpenAiBody(body, 'deepseek', 'deepseek-chat', lookup);
      const messages = result.messages as any[];

      expect(lookup).not.toHaveBeenCalled();
      expect(messages[0]).not.toHaveProperty('reasoning_content');
    });

    /* ── Message sanitization: reasoning_details ── */

    it('should strip reasoning_details for non-openrouter providers', () => {
      const body = {
        messages: [
          {
            role: 'assistant',
            content: '4',
            reasoning_details: [{ type: 'thinking', thinking: '2+2', signature: 'sig' }],
          },
        ],
      };

      const result = sanitizeOpenAiBody(body, 'mistral', 'ministral-3b-2512');
      const messages = result.messages as any[];

      expect(messages[0]).not.toHaveProperty('reasoning_details');
    });

    it('should strip reasoning_details for native openai targets', () => {
      const body = {
        messages: [
          {
            role: 'assistant',
            content: '4',
            reasoning_details: [{ type: 'thinking', thinking: 't', signature: 's' }],
          },
        ],
      };

      const result = sanitizeOpenAiBody(body, 'openai', 'gpt-4o');
      const messages = result.messages as any[];

      expect(messages[0]).not.toHaveProperty('reasoning_details');
    });

    it('should preserve reasoning_details for openrouter targets', () => {
      const details = [{ type: 'thinking', thinking: 't', signature: 's' }];
      const body = {
        messages: [{ role: 'assistant', content: '4', reasoning_details: details }],
      };

      const result = sanitizeOpenAiBody(body, 'openrouter', 'minimax/minimax-m2.7');
      const messages = result.messages as any[];

      expect(messages[0]).toHaveProperty('reasoning_details', details);
    });

    it('should handle non-array messages gracefully', () => {
      const body = { messages: 'not-an-array' };

      const result = sanitizeOpenAiBody(body as any, 'anthropic', 'claude-3');

      expect(result.messages).toBe('not-an-array');
    });

    it('should pass through non-object messages in array', () => {
      const body = { messages: [null, undefined, 42, 'string', [1, 2]] };

      const result = sanitizeOpenAiBody(body as any, 'anthropic', 'claude-3');
      const messages = result.messages as any[];

      expect(messages).toEqual([null, undefined, 42, 'string', [1, 2]]);
    });

    /* ── Mistral tool_call_id normalization ── */

    it('should rewrite non-conforming tool_call IDs for Mistral', () => {
      const body = {
        messages: [
          {
            role: 'assistant',
            tool_calls: [{ id: 'call_abcdefghijklmnop', type: 'function', function: {} }],
          },
          { role: 'tool', tool_call_id: 'call_abcdefghijklmnop', content: 'result' },
        ],
      };

      const result = sanitizeOpenAiBody(body, 'mistral', 'mistral-large');
      const messages = result.messages as any[];

      // The original ID doesn't match ^[A-Za-z0-9]{9}$, so it gets rewritten
      const newTcId = messages[0].tool_calls[0].id;
      expect(newTcId).toMatch(/^tc[a-z0-9]{7}$/);
      // The tool response's tool_call_id should match
      expect(messages[1].tool_call_id).toBe(newTcId);
    });

    it('should preserve conforming 9-char alphanumeric IDs for Mistral', () => {
      const validId = 'Abc123XYZ'; // 9 chars alphanumeric
      const body = {
        messages: [
          { role: 'assistant', tool_calls: [{ id: validId }] },
          { role: 'tool', tool_call_id: validId, content: 'ok' },
        ],
      };

      const result = sanitizeOpenAiBody(body, 'mistral', 'mistral-large');
      const messages = result.messages as any[];

      expect(messages[0].tool_calls[0].id).toBe(validId);
      expect(messages[1].tool_call_id).toBe(validId);
    });

    it('should not rewrite tool_call IDs for non-Mistral providers', () => {
      const body = {
        messages: [{ role: 'assistant', tool_calls: [{ id: 'call_long_id_here_123' }] }],
      };

      const result = sanitizeOpenAiBody(body, 'anthropic', 'claude-3');
      const messages = result.messages as any[];

      expect(messages[0].tool_calls[0].id).toBe('call_long_id_here_123');
    });

    it('should handle invalid tool_call entries in reservation phase for Mistral', () => {
      const body = {
        messages: [
          {
            role: 'assistant',
            tool_calls: [null, 42, [1, 2], { id: 'Abc123XYZ' }],
          },
        ],
      };

      const result = sanitizeOpenAiBody(body, 'mistral', 'mistral-large');
      const messages = result.messages as any[];

      // Non-object toolCalls should be skipped in reservation, valid one preserved
      expect(messages[0].tool_calls[3].id).toBe('Abc123XYZ');
    });

    it('should handle invalid tool_call entries in mapping phase for Mistral', () => {
      const body = {
        messages: [
          {
            role: 'assistant',
            tool_calls: [null, 'string', { id: 'longNonConformingId' }],
          },
        ],
      };

      const result = sanitizeOpenAiBody(body, 'mistral', 'mistral-large');
      const messages = result.messages as any[];

      // Non-object entries should pass through
      expect(messages[0].tool_calls[0]).toBeNull();
      expect(messages[0].tool_calls[1]).toBe('string');
      // Object entry should have rewritten id
      expect(messages[0].tool_calls[2].id).toMatch(/^tc/);
    });

    it('should handle non-string tool_call_id in reservation for Mistral', () => {
      const body = {
        messages: [{ role: 'tool', tool_call_id: 12345, content: 'result' }],
      };

      // Should not throw
      const result = sanitizeOpenAiBody(body, 'mistral', 'mistral-large');
      const messages = result.messages as any[];

      expect(messages[0].tool_call_id).toBe(12345);
    });

    it('should handle non-object message entries in reservation phase for Mistral', () => {
      const body = {
        messages: [null, 42, 'string', { role: 'user', content: 'Hi' }],
      };

      // Should not throw
      const result = sanitizeOpenAiBody(body as any, 'mistral', 'mistral-large');
      const messages = result.messages as any[];

      expect(messages[0]).toBeNull();
      expect(messages[1]).toBe(42);
      expect(messages[2]).toBe('string');
    });

    it('should handle array-type tool_call in reservation phase for Mistral', () => {
      const body = {
        messages: [{ role: 'assistant', tool_calls: [[1, 2], { id: 'Abc123XYZ' }] }],
      };

      const result = sanitizeOpenAiBody(body, 'mistral', 'mistral-large');
      const messages = result.messages as any[];

      // Array toolCalls should be skipped in reservation
      expect(messages[0].tool_calls[1].id).toBe('Abc123XYZ');
    });

    it('should generate unique IDs that avoid collisions with reserved IDs', () => {
      // Create a scenario where the first generated candidate would collide
      // This is hard to directly test, but we can verify uniqueness with multiple rewrites
      const body = {
        messages: [
          {
            role: 'assistant',
            tool_calls: [
              { id: 'very-long-call-id-1' },
              { id: 'very-long-call-id-2' },
              { id: 'very-long-call-id-3' },
            ],
          },
          { role: 'tool', tool_call_id: 'very-long-call-id-1', content: 'r1' },
          { role: 'tool', tool_call_id: 'very-long-call-id-2', content: 'r2' },
          { role: 'tool', tool_call_id: 'very-long-call-id-3', content: 'r3' },
        ],
      };

      const result = sanitizeOpenAiBody(body, 'mistral', 'mistral-large');
      const messages = result.messages as any[];

      const ids = messages[0].tool_calls.map((tc: any) => tc.id);
      // All IDs should be unique
      expect(new Set(ids).size).toBe(3);
      // Tool call IDs should match
      expect(messages[1].tool_call_id).toBe(ids[0]);
      expect(messages[2].tool_call_id).toBe(ids[1]);
      expect(messages[3].tool_call_id).toBe(ids[2]);
    });

    it('should reuse rewritten ID when same tool_call_id appears again', () => {
      const body = {
        messages: [
          {
            role: 'assistant',
            tool_calls: [{ id: 'long-call-id' }],
          },
          { role: 'tool', tool_call_id: 'long-call-id', content: 'r1' },
          // Same ID appears again (e.g., retried tool call)
          { role: 'tool', tool_call_id: 'long-call-id', content: 'r2' },
        ],
      };

      const result = sanitizeOpenAiBody(body, 'mistral', 'mistral-large');
      const messages = result.messages as any[];

      // Both tool responses should get the same rewritten ID
      expect(messages[1].tool_call_id).toBe(messages[2].tool_call_id);
      expect(messages[1].tool_call_id).toBe(messages[0].tool_calls[0].id);
    });

    /* ── max_tokens → max_completion_tokens for newer OpenAI models ── */

    it('should convert max_tokens to max_completion_tokens for GPT-5 models', () => {
      const body = {
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gpt-5',
        max_tokens: 4096,
      };

      const result = sanitizeOpenAiBody(body, 'openai', 'gpt-5');

      expect(result).toHaveProperty('max_completion_tokens', 4096);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should convert max_tokens for o-series models', () => {
      const body = {
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'o3',
        max_tokens: 2048,
      };

      const result = sanitizeOpenAiBody(body, 'openai', 'o3');

      expect(result).toHaveProperty('max_completion_tokens', 2048);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should keep max_tokens for older OpenAI models (GPT-4)', () => {
      const body = {
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gpt-4o',
        max_tokens: 4096,
      };

      const result = sanitizeOpenAiBody(body, 'openai', 'gpt-4o');

      expect(result).toHaveProperty('max_tokens', 4096);
      expect(result).not.toHaveProperty('max_completion_tokens');
    });

    it('should not convert when max_completion_tokens already present', () => {
      const body = {
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'gpt-5.2',
        max_tokens: 1000,
        max_completion_tokens: 2000,
      };

      const result = sanitizeOpenAiBody(body, 'openai', 'gpt-5.2');

      expect(result).toHaveProperty('max_completion_tokens', 2000);
      expect(result).toHaveProperty('max_tokens', 1000);
    });

    it('should not convert max_tokens for non-OpenAI providers', () => {
      const body = {
        messages: [{ role: 'user', content: 'Hi' }],
        model: 'mistral-large',
        max_tokens: 4096,
      };

      const result = sanitizeOpenAiBody(body, 'mistral', 'mistral-large');

      expect(result).toHaveProperty('max_tokens', 4096);
      expect(result).not.toHaveProperty('max_completion_tokens');
    });

    /* ── max_tokens → max_completion_tokens: extended edge cases ── */

    it('should convert max_tokens for o1 model', () => {
      const body = { messages: [], max_tokens: 2048 };

      const result = sanitizeOpenAiBody(body, 'openai', 'o1');

      expect(result).toHaveProperty('max_completion_tokens', 2048);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should convert max_tokens for o1-mini model', () => {
      const body = { messages: [], max_tokens: 1024 };

      const result = sanitizeOpenAiBody(body, 'openai', 'o1-mini');

      expect(result).toHaveProperty('max_completion_tokens', 1024);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should convert max_tokens for o3-mini model', () => {
      const body = { messages: [], max_tokens: 4096 };

      const result = sanitizeOpenAiBody(body, 'openai', 'o3-mini');

      expect(result).toHaveProperty('max_completion_tokens', 4096);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should convert max_tokens for o4-mini model', () => {
      const body = { messages: [], max_tokens: 8192 };

      const result = sanitizeOpenAiBody(body, 'openai', 'o4-mini');

      expect(result).toHaveProperty('max_completion_tokens', 8192);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should convert max_tokens for gpt-5.4 model', () => {
      const body = { messages: [], max_tokens: 16384 };

      const result = sanitizeOpenAiBody(body, 'openai', 'gpt-5.4');

      expect(result).toHaveProperty('max_completion_tokens', 16384);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should convert max_tokens for gpt-5-chat-latest model', () => {
      const body = { messages: [], max_tokens: 4096 };

      const result = sanitizeOpenAiBody(body, 'openai', 'gpt-5-chat-latest');

      expect(result).toHaveProperty('max_completion_tokens', 4096);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should NOT convert max_tokens for gpt-4.1 model', () => {
      const body = { messages: [], max_tokens: 4096 };

      const result = sanitizeOpenAiBody(body, 'openai', 'gpt-4.1');

      expect(result).toHaveProperty('max_tokens', 4096);
      expect(result).not.toHaveProperty('max_completion_tokens');
    });

    it('should NOT convert max_tokens for gpt-4o-mini model', () => {
      const body = { messages: [], max_tokens: 2048 };

      const result = sanitizeOpenAiBody(body, 'openai', 'gpt-4o-mini');

      expect(result).toHaveProperty('max_tokens', 2048);
      expect(result).not.toHaveProperty('max_completion_tokens');
    });

    it('should NOT convert for OpenRouter even when model is o3', () => {
      // OpenRouter is a passthrough provider, but it handles max_tokens itself
      // The conversion should only happen for endpointKey=openai
      const body = { messages: [], max_tokens: 4096 };

      const result = sanitizeOpenAiBody(body, 'openrouter', 'o3');

      // OpenRouter is passthrough, so max_tokens stays as-is (no conversion)
      expect(result).toHaveProperty('max_tokens', 4096);
      expect(result).not.toHaveProperty('max_completion_tokens');
    });

    it('should handle case insensitivity for o-series regex', () => {
      const body = { messages: [], max_tokens: 4096 };

      const result = sanitizeOpenAiBody(body, 'openai', 'O3');

      expect(result).toHaveProperty('max_completion_tokens', 4096);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should handle case insensitivity for GPT-5 regex', () => {
      const body = { messages: [], max_tokens: 4096 };

      const result = sanitizeOpenAiBody(body, 'openai', 'GPT-5');

      expect(result).toHaveProperty('max_completion_tokens', 4096);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should NOT convert when body has no max_tokens', () => {
      const body = { messages: [], model: 'gpt-5' };

      const result = sanitizeOpenAiBody(body, 'openai', 'gpt-5');

      expect(result).not.toHaveProperty('max_tokens');
      expect(result).not.toHaveProperty('max_completion_tokens');
    });

    it('should NOT match model names like "operative" that start with "o"', () => {
      const body = { messages: [], max_tokens: 4096 };

      // "operative" starts with "o" but the regex is /^(o[134]|gpt-5)/i
      // So "operative" won't match since it's o + non-[134] char
      const result = sanitizeOpenAiBody(body, 'openai', 'operative');

      expect(result).toHaveProperty('max_tokens', 4096);
      expect(result).not.toHaveProperty('max_completion_tokens');
    });

    it('should match o1-preview model', () => {
      const body = { messages: [], max_tokens: 4096 };

      const result = sanitizeOpenAiBody(body, 'openai', 'o1-preview');

      expect(result).toHaveProperty('max_completion_tokens', 4096);
      expect(result).not.toHaveProperty('max_tokens');
    });

    /* ── Non-passthrough provider: max_completion_tokens conversion ── */

    it('should convert max_completion_tokens to max_tokens for anthropic', () => {
      const body = {
        messages: [],
        max_completion_tokens: 4096,
      };

      const result = sanitizeOpenAiBody(body, 'anthropic', 'claude-opus-4-6');

      expect(result).toHaveProperty('max_tokens', 4096);
      expect(result).not.toHaveProperty('max_completion_tokens');
    });

    it('should convert max_completion_tokens to max_tokens for gemini', () => {
      const body = {
        messages: [],
        max_completion_tokens: 8192,
      };

      const result = sanitizeOpenAiBody(body, 'gemini', 'gemini-2.5-pro');

      expect(result).toHaveProperty('max_tokens', 8192);
      expect(result).not.toHaveProperty('max_completion_tokens');
    });

    it('should not convert max_completion_tokens when max_tokens already exists for non-passthrough', () => {
      const body = {
        messages: [],
        max_tokens: 2048,
        max_completion_tokens: 4096,
      };

      const result = sanitizeOpenAiBody(body, 'anthropic', 'claude-opus-4-6');

      expect(result).toHaveProperty('max_tokens', 2048);
      expect(result).not.toHaveProperty('max_completion_tokens');
    });

    /* ── Copilot: max_tokens → max_completion_tokens (mnfst/manifest#1849) ── */

    it('should convert max_tokens to max_completion_tokens for Copilot GPT-5', () => {
      const body = { messages: [{ role: 'user', content: 'hi' }], max_tokens: 4096 };

      const result = sanitizeOpenAiBody(body, 'copilot', 'gpt-5');

      expect(result).toHaveProperty('max_completion_tokens', 4096);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should convert max_tokens to max_completion_tokens for Copilot o-series', () => {
      const body = { messages: [], max_tokens: 2048 };

      const result = sanitizeOpenAiBody(body, 'copilot', 'o3-mini');

      expect(result).toHaveProperty('max_completion_tokens', 2048);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should preserve max_completion_tokens unchanged for Copilot GPT-5 family', () => {
      const body = { messages: [], max_completion_tokens: 1024 };

      const result = sanitizeOpenAiBody(body, 'copilot', 'gpt-5.2');

      expect(result).toHaveProperty('max_completion_tokens', 1024);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('should NOT convert max_tokens for Copilot GPT-4 family (legacy field still accepted)', () => {
      const body = { messages: [], max_tokens: 4096 };

      const result = sanitizeOpenAiBody(body, 'copilot', 'gpt-4o');

      expect(result).toHaveProperty('max_tokens', 4096);
      expect(result).not.toHaveProperty('max_completion_tokens');
    });

    it('should still strip OPENAI_ONLY_FIELDS for Copilot GPT-5', () => {
      const body = {
        messages: [],
        max_tokens: 4096,
        store: true,
        service_tier: 'auto',
      };

      const result = sanitizeOpenAiBody(body, 'copilot', 'gpt-5');

      expect(result).toHaveProperty('max_completion_tokens', 4096);
      expect(result).not.toHaveProperty('store');
      expect(result).not.toHaveProperty('service_tier');
    });

    /* ── Azure: max_tokens → max_completion_tokens + reasoning_effort (gpt-5/o-series) ── */

    it('converts max_tokens to max_completion_tokens for classic Azure GPT-5 deployments', () => {
      const body = { messages: [{ role: 'user', content: 'hi' }], max_tokens: 4096 };

      const result = sanitizeOpenAiBody(body, 'azure-openai-classic', 'gpt-5.4');

      expect(result).toHaveProperty('max_completion_tokens', 4096);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('converts max_tokens to max_completion_tokens for the Azure Foundry endpoint (o-series)', () => {
      const body = { messages: [], max_tokens: 2048 };

      const result = sanitizeOpenAiBody(body, 'azure', 'o3-mini');

      expect(result).toHaveProperty('max_completion_tokens', 2048);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('rewrites max_tokens for ANY Azure deployment, even non-reasoning / oddly-named ones', () => {
      // Azure deployment names are user-defined, so we can't tell from the name
      // alone whether it's an OpenAI reasoning model. All Azure deployments accept
      // max_completion_tokens, so rewrite unconditionally to avoid a 400 on an
      // OpenAI model deployed under a non-standard name.
      const grok = sanitizeOpenAiBody(
        { messages: [], max_tokens: 4096 },
        'azure-openai-classic',
        'grok-4.3',
      );
      expect(grok).toHaveProperty('max_completion_tokens', 4096);
      expect(grok).not.toHaveProperty('max_tokens');

      const oddName = sanitizeOpenAiBody(
        { messages: [], max_tokens: 4096 },
        'azure',
        'my-reasoner',
      );
      expect(oddName).toHaveProperty('max_completion_tokens', 4096);
      expect(oddName).not.toHaveProperty('max_tokens');
    });

    it('preserves reasoning_effort for Azure reasoning models', () => {
      const body = { messages: [], max_tokens: 256, reasoning_effort: 'low' };

      const result = sanitizeOpenAiBody(body, 'azure-openai-classic', 'gpt-5.4');

      expect(result).toHaveProperty('reasoning_effort', 'low');
      expect(result).toHaveProperty('max_completion_tokens', 256);
    });

    it('strips sampling params Azure rejects once reasoning is engaged', () => {
      const body = {
        messages: [],
        max_tokens: 256,
        reasoning_effort: 'low',
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0.2,
        presence_penalty: 0.3,
      };

      const result = sanitizeOpenAiBody(body, 'azure-openai-classic', 'gpt-5.4');

      expect(result).toHaveProperty('reasoning_effort', 'low');
      expect(result).toHaveProperty('max_completion_tokens', 256);
      expect(result).not.toHaveProperty('temperature');
      expect(result).not.toHaveProperty('top_p');
      expect(result).not.toHaveProperty('frequency_penalty');
      expect(result).not.toHaveProperty('presence_penalty');
    });

    it('keeps temperature=1 (the only supported value) when reasoning is engaged', () => {
      const body = { messages: [], max_tokens: 256, reasoning_effort: 'low', temperature: 1 };

      const result = sanitizeOpenAiBody(body, 'azure-openai-classic', 'gpt-5.4');

      expect(result).toHaveProperty('temperature', 1);
    });

    it('keeps sampling params for Azure reasoning models when reasoning is NOT engaged', () => {
      const body = { messages: [], max_tokens: 256, temperature: 0.7, top_p: 0.9 };

      const result = sanitizeOpenAiBody(body, 'azure-openai-classic', 'gpt-5.4');

      expect(result).toHaveProperty('temperature', 0.7);
      expect(result).toHaveProperty('top_p', 0.9);
      expect(result).toHaveProperty('max_completion_tokens', 256);
    });

    it('strips reasoning_effort for non-reasoning Azure deployments (and still rewrites max_tokens)', () => {
      const body = { messages: [], max_tokens: 256, reasoning_effort: 'low' };

      const result = sanitizeOpenAiBody(body, 'azure-openai-classic', 'grok-4.3');

      expect(result).not.toHaveProperty('reasoning_effort');
      expect(result).toHaveProperty('max_completion_tokens', 256);
      expect(result).not.toHaveProperty('max_tokens');
    });

    it('still strips other OpenAI-only fields for Azure GPT-5 while keeping reasoning_effort', () => {
      const body = {
        messages: [],
        max_tokens: 256,
        store: true,
        service_tier: 'auto',
        reasoning_effort: 'medium',
      };

      const result = sanitizeOpenAiBody(body, 'azure', 'gpt-5');

      expect(result).toHaveProperty('max_completion_tokens', 256);
      expect(result).toHaveProperty('reasoning_effort', 'medium');
      expect(result).not.toHaveProperty('store');
      expect(result).not.toHaveProperty('service_tier');
    });

    /* ── Native OpenAI reasoning models share the same constraint ── */

    it('strips reasoning-incompatible sampling params for native OpenAI reasoning models', () => {
      const body = {
        messages: [],
        max_tokens: 256,
        temperature: 0.7,
        top_p: 0.9,
        frequency_penalty: 0.1,
        presence_penalty: 0.2,
        reasoning_effort: 'high',
      };

      const result = sanitizeOpenAiBody(body, 'openai', 'gpt-5');

      expect(result).toHaveProperty('max_completion_tokens', 256);
      expect(result).toHaveProperty('reasoning_effort', 'high');
      expect(result).not.toHaveProperty('temperature');
      expect(result).not.toHaveProperty('top_p');
      expect(result).not.toHaveProperty('frequency_penalty');
      expect(result).not.toHaveProperty('presence_penalty');
    });

    it('keeps sampling params for native OpenAI reasoning models when reasoning is NOT engaged', () => {
      const body = { messages: [], max_tokens: 256, temperature: 0.7, top_p: 0.9 };

      const result = sanitizeOpenAiBody(body, 'openai', 'gpt-5');

      expect(result).toHaveProperty('temperature', 0.7);
      expect(result).toHaveProperty('top_p', 0.9);
      expect(result).toHaveProperty('max_completion_tokens', 256);
    });

    it('does not strip sampling params for Copilot (reasoning_effort is stripped, so reasoning never engages)', () => {
      const body = { messages: [], max_tokens: 256, temperature: 0.7, reasoning_effort: 'low' };

      const result = sanitizeOpenAiBody(body, 'copilot', 'gpt-5');

      expect(result).toHaveProperty('max_completion_tokens', 256);
      expect(result).not.toHaveProperty('reasoning_effort');
      expect(result).toHaveProperty('temperature', 0.7);
    });
  });

  describe('createReasoningContentStreamTransformer', () => {
    it('normalizes Copilot reasoning_text to reasoning_content for clients', () => {
      const transform = createReasoningContentStreamTransformer(undefined, {
        outputStreamDeltaPaths: ['reasoning_content', 'reasoning_text'],
        clientStreamDeltaPath: 'reasoning_content',
      });

      const out = transform(
        JSON.stringify({
          choices: [
            {
              delta: {
                role: 'assistant',
                content: '',
                reasoning_text: 'Let me think.',
              },
              finish_reason: null,
            },
          ],
          model: 'claude-sonnet-4.6',
        }),
      );
      const data = JSON.parse(out!.replace('data: ', '').trim());

      expect(data.choices[0].delta.reasoning_text).toBe('Let me think.');
      expect(data.choices[0].delta.reasoning_content).toBe('Let me think.');
    });

    it('keeps existing reasoning_content when a provider sends multiple reasoning aliases', () => {
      const transform = createReasoningContentStreamTransformer(undefined, {
        outputStreamDeltaPaths: ['reasoning_content', 'reasoning_text'],
        clientStreamDeltaPath: 'reasoning_content',
      });

      const input = JSON.stringify({
        choices: [
          {
            delta: {
              reasoning_content: 'standard',
              reasoning_text: 'provider alias',
            },
            finish_reason: null,
          },
        ],
      });

      expect(transform(input)).toBe(`data: ${input}\n\n`);
    });

    it('does not assign unsafe reasoning client paths', () => {
      const transform = createReasoningContentStreamTransformer(undefined, {
        outputStreamDeltaPaths: ['reasoning_text'],
        clientStreamDeltaPath: '__proto__.polluted' as 'reasoning_content',
      });
      const input = JSON.stringify({
        choices: [{ delta: { reasoning_text: 'unsafe' }, finish_reason: null }],
      });

      expect(transform(input)).toBe(`data: ${input}\n\n`);
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('accumulates reasoning_content and fires callback on tool-call finish', () => {
      const callback = jest.fn();
      const transform = createReasoningContentStreamTransformer(callback);

      expect(
        transform(
          JSON.stringify({
            choices: [{ delta: { reasoning_content: 'I should ' }, finish_reason: null }],
          }),
        ),
      ).toContain('reasoning_content');
      transform(
        JSON.stringify({
          choices: [{ delta: { reasoning_content: 'use a tool.' }, finish_reason: null }],
        }),
      );
      transform(
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup' } }],
              },
              finish_reason: null,
            },
          ],
        }),
      );
      transform(JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('call_1', 'I should use a tool.');
    });

    it('stores reasoning_content once a tool call id appears even without a tool-call finish marker', () => {
      const callback = jest.fn();
      const transform = createReasoningContentStreamTransformer(callback);

      transform(
        JSON.stringify({
          choices: [{ delta: { reasoning_content: 'I should use a tool.' }, finish_reason: null }],
        }),
      );
      transform(
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup' } }],
              },
              finish_reason: null,
            },
          ],
        }),
      );

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith('call_1', 'I should use a tool.');
    });

    it('updates cached reasoning_content if more reasoning arrives after the tool call id', () => {
      const callback = jest.fn();
      const transform = createReasoningContentStreamTransformer(callback);

      transform(
        JSON.stringify({
          choices: [{ delta: { reasoning_content: 'plan A' }, finish_reason: null }],
        }),
      );
      transform(
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup' } }],
              },
              finish_reason: null,
            },
          ],
        }),
      );
      transform(
        JSON.stringify({
          choices: [{ delta: { reasoning_content: ' then plan B' }, finish_reason: null }],
        }),
      );

      expect(callback).toHaveBeenCalledTimes(2);
      expect(callback).toHaveBeenLastCalledWith('call_1', 'plan A then plan B');
    });

    it('does not fire without a tool call id', () => {
      const callback = jest.fn();
      const transform = createReasoningContentStreamTransformer(callback);

      transform(
        JSON.stringify({
          choices: [{ delta: { reasoning_content: 'thinking' }, finish_reason: null }],
        }),
      );
      transform(JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }));

      expect(callback).not.toHaveBeenCalled();
    });

    it('passes malformed chunks through unchanged as SSE data', () => {
      const callback = jest.fn();
      const transform = createReasoningContentStreamTransformer(callback);

      expect(transform('not json')).toBe('data: not json\n\n');
      expect(callback).not.toHaveBeenCalled();
    });

    it('accumulates normalized reasoning aliases for tool-call replay cache', () => {
      const callback = jest.fn();
      const transform = createReasoningContentStreamTransformer(callback, {
        outputStreamDeltaPaths: ['reasoning_content', 'reasoning_text'],
        clientStreamDeltaPath: 'reasoning_content',
      });

      transform(
        JSON.stringify({
          choices: [{ delta: { reasoning_text: 'use ' }, finish_reason: null }],
        }),
      );
      transform(
        JSON.stringify({
          choices: [{ delta: { reasoning_text: 'a tool' }, finish_reason: null }],
        }),
      );
      transform(
        JSON.stringify({
          choices: [
            {
              delta: {
                tool_calls: [{ id: 'call_1', type: 'function', function: { name: 'lookup' } }],
              },
              finish_reason: null,
            },
          ],
        }),
      );

      expect(callback).toHaveBeenCalledWith('call_1', 'use a tool');
    });
  });
});
