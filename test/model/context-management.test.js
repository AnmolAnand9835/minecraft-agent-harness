import test from 'node:test';
import assert from 'node:assert/strict';
import { compactMinecraftContext, geminiRateLimit, rateLimitDelay } from '../../src/model/context-management.js';

test('compresses old history while carrying current survival state and durable progress', () => {
    const messages = [
        { role: 'system', content: 'Objective: build a safe shelter' },
        { role: 'user', content: 'My shelter location is 10,64,20.' },
        { role: 'assistant', content: 'Next action: craft planks' },
        {
            role: 'toolResult',
            toolName: 'craft',
            isError: false,
            content: [{ type: 'text', text: '{"crafted":"oak_planks","count":8}' }],
        },
        ...Array.from({ length: 80 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `old message ${i}` })),
    ];
    const observation = JSON.stringify({
        position: { x: 11, y: 64, z: 20 },
        health: 16,
        food: 12,
        inventory: { items: [{ name: 'oak_planks', count: 8 }] },
        entities: [{ name: 'creeper', position: { x: 15, y: 64, z: 20 }, threat: true }],
    });

    const result = compactMinecraftContext(messages, observation, { objective: 'Build a safe shelter' });
    assert.ok(result.afterChars < result.beforeChars);
    assert.ok(result.messages.length < messages.length);
    assert.equal(result.messages[0], messages[0]);
    assert.deepEqual(result.summary.completedTasks, ['craft: {"crafted":"oak_planks","count":8}']);
    assert.deepEqual(result.summary.importantLocations, ['My shelter location is 10,64,20']);
    assert.equal(result.summary.position, '11,64,20');
    assert.equal(result.summary.health, 16);
    assert.equal(result.summary.food, 12);
    assert.equal(result.summary.inventory, 'oak_planks x8');
    assert.match(result.summaryText, /Nearby threats: creeper at 15,64,20/);
    assert.match(result.summaryText, /Last successful action: craft:/);
    assert.match(result.summaryText, /Next planned action: craft planks/);
    assert.equal(
        result.messages.some(message => String(message.content).includes('old message 0')),
        false,
    );
});

test('classifies Gemini TPM, daily quota and generic rate-limit errors and honors retry-after', () => {
    assert.deepEqual(
        geminiRateLimit({
            status: 429,
            errorMessage: 'generate_content_free_tier_input_token_count',
            headers: { 'retry-after': '30' },
        }),
        { category: 'input_tokens_per_minute', retryAfterMs: 30000 },
    );
    assert.equal(
        geminiRateLimit({ status: 429, message: 'generate_content_free_tier_requests per day' }).category,
        'daily_quota',
    );
    assert.equal(geminiRateLimit({ status: 429, message: 'temporary overload' }).category, 'http_429');
    assert.equal(geminiRateLimit({ status: 400, message: 'invalid request' }), null);
});

test('rate-limit exponential delay is jittered and bounded without ignoring Retry-After', () => {
    assert.equal(rateLimitDelay({ attempt: 2, random: () => 0 }), 15000);
    assert.equal(rateLimitDelay({ attempt: 2, retryAfterMs: 40000, random: () => 0 }), 40000);
    assert.equal(rateLimitDelay({ attempt: 2, retryAfterMs: 400000, random: () => 1, maxMs: 300000 }), 400000);
});
