import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { RunIds, SESSION_ID_PATTERN, sessionIdOf, uuidFrom } from './ids/deterministic-ids.ts';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const MESSAGE_ID = /^msg_[0-9a-f]{24}$/;
const TOOL_USE_ID = /^toolu_[0-9a-f]{24}$/;
const SAMPLE_SIZE = 500;

describe('uuidFrom', () => {
  it('is a version 4 UUID that depends only on the seed', () => {
    assert.match(uuidFrom('seed'), UUID_V4);
    assert.equal(uuidFrom('seed'), uuidFrom('seed'));
    assert.notEqual(uuidFrom('seed'), uuidFrom('other seed'));
  });

  it('keeps the UUID shape for every seed of a large sample', () => {
    for (let seed = 0; seed < SAMPLE_SIZE; seed += 1) {
      assert.match(uuidFrom(String(seed)), UUID_V4);
    }
  });
});

describe('sessionIdOf', () => {
  it('derives a distinct, stable identifier from the session counter', () => {
    const identifiers = Array.from({ length: SAMPLE_SIZE }, (_, index) => sessionIdOf(index + 1));
    assert.equal(new Set(identifiers).size, SAMPLE_SIZE);
    assert.deepEqual(identifiers.slice(0, 3), [sessionIdOf(1), sessionIdOf(2), sessionIdOf(3)]);
    identifiers.forEach((identifier) => assert.match(identifier, SESSION_ID_PATTERN));
  });
});

describe('RunIds', () => {
  it('numbers every kind of identifier on its own and never repeats one', () => {
    const ids = new RunIds(sessionIdOf(1), 1);
    const lines = Array.from({ length: 50 }, () => ids.line());
    const messages = Array.from({ length: 50 }, () => ids.message());
    const toolUses = Array.from({ length: 50 }, () => ids.toolUse());
    const hooks = Array.from({ length: 50 }, () => ids.hook());
    assert.equal(new Set([...lines, ...hooks, ids.prompt()]).size, 101);
    assert.equal(new Set(messages).size, 50);
    assert.equal(new Set(toolUses).size, 50);
    lines.forEach((identifier) => assert.match(identifier, UUID_V4));
    messages.forEach((identifier) => assert.match(identifier, MESSAGE_ID));
    toolUses.forEach((identifier) => assert.match(identifier, TOOL_USE_ID));
  });

  it('repeats the same sequence for the same session and run, and a new one for another run or session', () => {
    const firstMessage = (sessionNumber: number, runNumber: number): string => new RunIds(sessionIdOf(sessionNumber), runNumber).message();
    const firstToolUse = (sessionNumber: number, runNumber: number): string => new RunIds(sessionIdOf(sessionNumber), runNumber).toolUse();
    assert.equal(firstMessage(1, 1), firstMessage(1, 1));
    assert.equal(firstToolUse(1, 1), firstToolUse(1, 1));
    assert.notEqual(firstMessage(1, 1), firstMessage(1, 2));
    assert.notEqual(firstMessage(1, 1), firstMessage(2, 1));
    assert.notEqual(firstToolUse(1, 1), firstToolUse(1, 2));
  });
});
