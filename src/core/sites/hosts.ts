// Host match patterns per site. Tier 1 hosts are granted at install; Tier 2
// hosts are optional and requested when the user turns a site on.

export const TIER1_HOST_PERMISSIONS = [
  'https://chatgpt.com/*',
  'https://chat.openai.com/*',
  'https://claude.ai/*',
  'https://gemini.google.com/*',
  'https://aistudio.google.com/*',
  'https://grok.com/*',
] as const;

// Hosts that serve uploaded files and generated images for Tier 1 sites. The
// background fetches real file bytes from them for exports (SPEC §6F).
export const TIER1_ASSET_HOST_PERMISSIONS = [
  'https://*.oaiusercontent.com/*',
  'https://*.googleusercontent.com/*',
  'https://assets.grok.com/*',
] as const;

export const TIER2_HOST_PERMISSIONS = [
  'https://www.perplexity.ai/*',
  'https://chat.deepseek.com/*',
  'https://chat.mistral.ai/*',
  'https://www.kimi.com/*',
  'https://kimi.moonshot.cn/*',
  'https://poe.com/*',
  'https://copilot.microsoft.com/*',
  'https://github.com/copilot/*',
  'https://www.google.com/search*',
] as const;
