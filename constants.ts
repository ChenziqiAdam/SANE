// Storage keys
export const STORAGE_KEY_LEGACY_EMBEDDINGS = 'sane-embeddings';

// Icon
export const ICON_ID = 'sane-brain';

// Frontmatter field names written by SANE
export const FM_TAGS = 'sane_tags';
export const FM_KEYWORDS = 'sane_keywords';
export const FM_LINKS = 'sane_links';
export const FM_SUMMARY = 'sane_summary';
export const FM_UPDATED = 'sane_updated';
export const FM_VERSION = 'sane_version';
export const FM_CREATED_AT = 'created_at';
export const FM_MODIFIED_AT = 'modified_at';
export const SANE_VERSION = '1.0';

// Default models per provider
export const DEFAULT_LLM_MODELS: Record<string, string> = {
	openai: 'gpt-5-nano',
	google: 'gemini-2.5-flash',
	grok: 'grok-4.3',
	azure: 'gpt-4o-mini',
	local: 'llama3-7b',
};

export const DEFAULT_EMBEDDING_MODELS: Record<string, string> = {
	openai: 'text-embedding-3-small',
	google: 'text-embedding-004',
	local: 'nomic-embed-text',
};

// Provider API endpoints
export const GROK_API_URL = 'https://api.x.ai/v1/chat/completions';
export const AZURE_API_VERSION = '2024-10-21';
export const LOCAL_LLM_GENERATE_PATH = '/v1/chat/completions';
export const LOCAL_LLM_EMBEDDINGS_PATH = '/v1/embeddings';
export const DEFAULT_LOCAL_ENDPOINT = 'http://localhost:11434';

// Pricing estimates (per 1000 tokens)
export const PROVIDER_PRICING: Record<string, Record<string, number>> = {
	openai: { gpt4: 0.03, embedding: 0.0001 },
	google: { gemini: 0.0005, embedding: 0.00001 },
	grok: { default: 0.002 },
	azure: { default: 0.03 },
	local: { default: 0 },
};

// Retry delays for rate-limited requests (ms)
export const RETRY_DELAYS_MS = [2000, 4000, 8000];

// Simple embedding dimension (for providers without native embedding support)
export const SIMPLE_EMBEDDING_DIM = 384;
