import { describe, expect, it } from 'vitest';
import { activeBranch, allBranches, deepestLeaf, forkPoints, linearMessages, siblingPosition } from '../../src/core/model/tree';
import type { Message } from '../../src/core/schema/archive';

function msg(id: string, parentId: string | null, childIds: string[], role: Message['role'] = 'user'): Message {
  return { id, parentId, childIds, role, parts: [{ type: 'text', text: id }], attachmentIds: [], artifactIds: [] };
}

// root -> u1 -> a1 -> u2 -> a2
//                  \-> u2b -> a2b      (edited prompt)
//                         \-> a2c      (regenerated reply)
const messages = {
  u1: msg('u1', null, ['a1']),
  a1: msg('a1', 'u1', ['u2', 'u2b'], 'assistant'),
  u2: msg('u2', 'a1', ['a2']),
  a2: msg('a2', 'u2', [], 'assistant'),
  u2b: msg('u2b', 'a1', ['a2b', 'a2c']),
  a2b: msg('a2b', 'u2b', [], 'assistant'),
  a2c: msg('a2c', 'u2b', [], 'assistant'),
};

describe('branch tree', () => {
  it('walks the active branch from the current leaf', () => {
    const conv = { messages, rootIds: ['u1'], currentLeafId: 'a2b' };
    expect(activeBranch(conv).map((m) => m.id)).toEqual(['u1', 'a1', 'u2b', 'a2b']);
  });

  it('falls back to the last child at every fork without a current node', () => {
    const conv = { messages, rootIds: ['u1'], currentLeafId: null };
    expect(deepestLeaf(conv)).toBe('a2c');
    expect(activeBranch(conv).map((m) => m.id)).toEqual(['u1', 'a1', 'u2b', 'a2c']);
  });

  it('lists every branch and fork point', () => {
    const conv = { messages, rootIds: ['u1'] };
    expect(allBranches(conv)).toEqual([
      ['u1', 'a1', 'u2', 'a2'],
      ['u1', 'a1', 'u2b', 'a2b'],
      ['u1', 'a1', 'u2b', 'a2c'],
    ]);
    expect(forkPoints({ messages }).map((m) => m.id).sort()).toEqual(['a1', 'u2b']);
    expect(siblingPosition(conv, 'a2c')).toEqual({ index: 2, count: 2 });
  });

  it('stops on cycles and dangling parents', () => {
    const cyc = { a: msg('a', 'b', ['b']), b: msg('b', 'a', ['a']) };
    expect(activeBranch({ messages: cyc, rootIds: [], currentLeafId: 'a' }).length).toBe(2);
    const dangling = { x: msg('x', 'missing', []) };
    expect(activeBranch({ messages: dangling, rootIds: [], currentLeafId: 'x' }).map((m) => m.id)).toEqual(['x']);
  });

  it('builds a linear tree', () => {
    const t = linearMessages([
      { id: '1', role: 'user', parts: [], attachmentIds: [], artifactIds: [] },
      { id: '2', role: 'assistant', parts: [], attachmentIds: [], artifactIds: [] },
    ]);
    expect(t.rootIds).toEqual(['1']);
    expect(t.currentLeafId).toBe('2');
    expect(t.messages['1']!.childIds).toEqual(['2']);
  });
});
