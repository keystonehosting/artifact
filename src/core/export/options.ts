// Export options from the user's settings.
import { DEFAULT_EXPORT_OPTIONS, type ExportOptions } from './document';
import type { Settings } from '../settings/settings';

export function optionsFromSettings(s: Settings, extra: Partial<ExportOptions> = {}): ExportOptions {
  const e = s.export;
  return {
    ...DEFAULT_EXPORT_OPTIONS,
    filenameTemplate: e.filenameTemplate,
    numbering: e.numbering,
    includeTimestamps: e.includeTimestamps,
    includeToc: e.includeToc,
    includeThinking: e.includeThinking,
    includeImages: e.includeImages,
    includeFiles: e.includeFiles,
    includeArtifacts: e.includeArtifacts,
    includeToolCalls: e.includeToolCalls,
    includeCredit: e.includeCredit,
    branches: e.branches,
    ...extra,
  };
}

