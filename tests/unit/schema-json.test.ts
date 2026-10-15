import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { ArchiveSchema, ARCHIVE_SCHEMA_URL } from '../../src/core/schema/archive';

const PATH = join(__dirname, '..', '..', 'schemas', 'artifact-archive-v1.json');

function generate(): string {
  const schema = z.toJSONSchema(ArchiveSchema, { target: 'draft-2020-12' }) as Record<string, unknown>;
  const out = {
    $id: ARCHIVE_SCHEMA_URL,
    title: 'Artifact archive v1',
    description:
      'Artifact export and backup format. Extends ACE export-v1: each conversation carries ACE-compatible source_ace and a flat activeBranch, plus the full branch tree, attachments and artifacts.',
    ...schema,
  };
  return JSON.stringify(out, null, 2) + '\n';
}

describe('published JSON schema', () => {
  it('matches the Zod schema (run with UPDATE_SCHEMA=1 to regenerate)', () => {
    const want = generate();
    if (process.env.UPDATE_SCHEMA) writeFileSync(PATH, want);
    expect(readFileSync(PATH, 'utf8')).toBe(want);
  });
});
