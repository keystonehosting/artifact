import { describe, expect, it } from 'vitest';
import { decodeBatchExecute, encodeBatchExecute, at } from '../../src/core/schema/payloads/batchexecute';
import { fixture } from './fixtures';

describe('batchexecute envelope', () => {
  it('decodes the captured Gemini hNvQHb response', () => {
    const raw = JSON.parse(fixture('sites/gemini-api-response.json')) as { page1_raw: string };
    const frames = decodeBatchExecute(raw.page1_raw);
    const read = frames.find((f) => f.rpcId === 'hNvQHb');
    expect(read).toBeDefined();
    const firstTurn = at(read!.payload, 0, 0);
    expect(at(firstTurn, 0, 0)).toMatch(/^c_/);
    expect(typeof at(firstTurn, 2, 0, 0)).toBe('string');
  });

  it('encodes a request body', () => {
    const body = encodeBatchExecute('MaZiqc', [13, null], 'tok:1');
    expect(decodeURIComponent(body)).toBe('f.req=[[["MaZiqc","[13,null]",null,"generic"]]]&at=tok:1&');
  });

  it('rejects garbage', () => {
    expect(() => decodeBatchExecute(")]}'\nxyz")).toThrow();
  });
});
