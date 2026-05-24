import { Notice, requestUrl } from 'obsidian';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, Enhancement, SANESettings, SANEError } from './types';
import {
	GROK_API_URL,
	AZURE_API_VERSION,
	LOCAL_LLM_GENERATE_PATH,
	LOCAL_LLM_EMBEDDINGS_PATH,
	DEFAULT_LLM_MODELS,
	DEFAULT_EMBEDDING_MODELS,
	PROVIDER_PRICING,
	RETRY_DELAYS_MS,
	SIMPLE_EMBEDDING_DIM,
} from './constants';

export class UnifiedAIProvider implements AIProvider {
	private settings: SANESettings;
	private openaiClient?: OpenAI;
	private googleClient?: GoogleGenerativeAI;
	private embeddingOpenaiClient?: OpenAI;
	private embeddingGoogleClient?: GoogleGenerativeAI;
	private openaiApiKey = '';
	private googleApiKey = '';
	private grokApiKey = '';
	private azureApiKey = '';
	private embeddingOpenaiKey = '';
	private embeddingGoogleKey = '';

	constructor(settings: SANESettings, keys?: Record<string, string>) {
		this.settings = settings;
		if (keys) this.applyKeys(keys);
		this.initializeClients();
		this.initializeEmbeddingClients();
	}

	private applyKeys(keys: Record<string, string>): void {
		this.openaiApiKey = keys['openai'] ?? '';
		this.googleApiKey = keys['google'] ?? '';
		this.grokApiKey = keys['grok'] ?? '';
		this.azureApiKey = keys['azure'] ?? '';
		this.embeddingOpenaiKey = keys['embeddingOpenai'] ?? '';
		this.embeddingGoogleKey = keys['embeddingGoogle'] ?? '';
	}

	updateKeys(keys: Record<string, string>): void {
		this.applyKeys(keys);
		this.initializeClients();
		this.initializeEmbeddingClients();
	}

	private initializeClients(): void {
		if (this.settings.aiProvider === 'openai' && this.openaiApiKey) {
			this.openaiClient = new OpenAI({
				apiKey: this.openaiApiKey,
				dangerouslyAllowBrowser: true
			});
		} else if (this.settings.aiProvider === 'google' && this.googleApiKey) {
			this.googleClient = new GoogleGenerativeAI(this.googleApiKey);
		}
	}

	private initializeEmbeddingClients(): void {
		if (this.embeddingOpenaiKey) {
			this.embeddingOpenaiClient = new OpenAI({
				apiKey: this.embeddingOpenaiKey,
				dangerouslyAllowBrowser: true
			});
		}
		if (this.embeddingGoogleKey) {
			this.embeddingGoogleClient = new GoogleGenerativeAI(this.embeddingGoogleKey);
		}
	}

	updateSettings(settings: SANESettings): void {
		this.settings = settings;
		this.initializeClients();
		this.initializeEmbeddingClients();
	}

	async generateEnhancement(content: string, relatedContent: string[]): Promise<Enhancement> {
		const relatedContext = relatedContent.length > 0 
			? `\n\nRelated notes context:\n${relatedContent.join('\n---\n')}` 
			: '';

		const prompt = `Analyze this note and generate enhancements based on the content and related notes.

Note content:
${content}${relatedContext}

Please provide ONLY a valid JSON response with this exact format (no markdown, no code blocks, no extra text):

{
  "tags": ["tag1", "tag2", "tag3"],
  "keywords": ["keyword1", "keyword2", "keyword3"],
  "links": ["Note Title 1", "Note Title 2"],
  "summary": "Brief 1-2 sentence summary"
}

Requirements:
- Generate 3-7 relevant tags (lowercase, no spaces, use hyphens)
- Extract 3-8 important keywords or phrases
- Suggest links only to notes mentioned in related context, and ONLY return the note titles. Return no titles if no related notes provided
- Keep summary under 50 words
- Return ONLY valid JSON, no markdown formatting`;

		try {
			let response: string;
			switch (this.settings.aiProvider) {
				case 'openai':
					response = await this.withRetry(() => this.callOpenAI(prompt), 'OpenAI');
					break;
				case 'google':
					response = await this.withRetry(() => this.callGoogle(prompt), 'Google AI');
					break;
				case 'grok':
					response = await this.withRetry(() => this.callGrok(prompt), 'Grok');
					break;
				case 'azure':
					response = await this.withRetry(() => this.callAzure(prompt), 'Azure OpenAI');
					break;
				case 'local':
					response = await this.withRetry(() => this.callLocal(prompt), 'Local LLM');
					break;
				default:
					throw new SANEError(`Unsupported AI provider: ${String(this.settings.aiProvider)}`);
			}

			// Parse JSON response (handle markdown code blocks)
			const enhancement = this.parseAIResponse(response);
			return {
				tags: enhancement.tags || [],
				keywords: enhancement.keywords || [],
				links: enhancement.links || [],
				summary: enhancement.summary || ''
			};

		} catch (error) {
			if (error instanceof Error && error.message.includes('budget')) {
				new Notice('Daily budget reached. Processing paused until tomorrow.');
			} else {
				new Notice(`Error processing note: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
			
			return { tags: [], keywords: [], links: [], summary: '' };
		}
	}

	async generateEmbedding(content: string): Promise<number[]> {
		try {
			switch (this.settings.embeddingProvider) {
				case 'openai':
					return await this.withRetry(() => this.generateOpenAIEmbedding(content), 'OpenAI');
				case 'google':
					return await this.withRetry(() => this.generateGoogleEmbedding(content), 'Google AI');
				case 'local':
					return await this.withRetry(() => this.generateLocalEmbedding(content), 'Local LLM');
				default:
					return this.generateSimpleEmbedding(content);
			}
		} catch (error) {
			const errorMessage = error instanceof SANEError ? error.userMessage : (error instanceof Error ? error.message : 'Unknown error');
			new Notice(`Failed to generate embedding: ${errorMessage}`);
			return [];
		}
	}

	estimateCost(tokens: number): number {
		const pricing = PROVIDER_PRICING;

		const provider = this.settings.aiProvider;
		const providerPricing = pricing[provider];
		let basePrice = 0.01; // default fallback
		
		if (providerPricing) {
			if ('default' in providerPricing) {
				basePrice = providerPricing.default;
			} else if ('gpt4' in providerPricing) {
				basePrice = providerPricing.gpt4;
			} else if ('gemini' in providerPricing) {
				basePrice = providerPricing.gemini;
			}
		}
		
		return (tokens / 1000) * basePrice;
	}

	private async callOpenAI(prompt: string): Promise<string> {
		if (!this.openaiClient) throw new Error('OpenAI client not initialized');

		const response = await this.openaiClient.chat.completions.create({
			model: this.settings.llmModel,
			messages: [{ role: 'user', content: prompt }],
			max_tokens: this.settings.maxTokens,
			temperature: this.settings.temperature
		});

		return response.choices[0]?.message?.content || '';
	}

	private async callGoogle(prompt: string): Promise<string> {
		if (!this.googleClient) throw new Error('Google client not initialized');

		const model = this.googleClient.getGenerativeModel({ model: this.settings.llmModel });
		const result = await model.generateContent(prompt);
		const response = result.response;
		
		return response.text();
	}

	private async callGrok(prompt: string): Promise<string> {
		// Grok API (X.AI) - using OpenAI-compatible interface
		const response = await requestUrl({
			url: GROK_API_URL,
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.grokApiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.settings.llmModel || DEFAULT_LLM_MODELS['grok'],
				messages: [{ role: 'user', content: prompt }],
				max_tokens: this.settings.maxTokens,
				temperature: this.settings.temperature
			})
		});

		if (response.status !== 200) {
			throw new Error(`Grok API error: ${response.status}`);
		}

		const grokJson = response.json as { choices: Array<{ message: { content: string } }> };
		return grokJson.choices[0]?.message?.content || '';
	}

	private async callAzure(prompt: string): Promise<string> {
		// Azure OpenAI Service
		const response = await requestUrl({
			url: `${this.settings.azureEndpoint}/openai/deployments/${this.settings.llmModel}/chat/completions?api-version=${AZURE_API_VERSION}`,
			method: 'POST',
			headers: {
				'api-key': this.azureApiKey,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				messages: [{ role: 'user', content: prompt }],
				max_tokens: this.settings.maxTokens,
				temperature: this.settings.temperature
			})
		});

		if (response.status !== 200) {
			throw new Error(`Azure API error: ${response.status}`);
		}

		const azureJson = response.json as { choices: Array<{ message: { content: string } }> };
		return azureJson.choices[0]?.message?.content || '';
	}

	private callLocal(prompt: string): Promise<string> {
		return requestUrl({
			url: `${this.settings.localEndpoint}${LOCAL_LLM_GENERATE_PATH}`,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: this.settings.llmModel || DEFAULT_LLM_MODELS['local'],
				messages: [{ role: 'user', content: prompt }],
				stream: false
			})
		}).then((response) => {
			if (response.status !== 200) {
				throw new Error(`Local LLM error: ${response.status}`);
			}
			const json = response.json as { choices: Array<{ message: { content: string } }> };
			return json.choices[0]?.message?.content || '';
		});
	}

	private async generateOpenAIEmbedding(content: string): Promise<number[]> {
		if (!this.embeddingOpenaiClient) throw new Error('OpenAI embedding API key not configured');
		const response = await this.embeddingOpenaiClient.embeddings.create({
			model: this.settings.embeddingModel,
			input: content
		});
		return response.data[0].embedding;
	}

	private async generateGoogleEmbedding(content: string): Promise<number[]> {
		if (!this.embeddingGoogleClient) throw new Error('Google embedding API key not configured');
		const model = this.embeddingGoogleClient.getGenerativeModel({ model: this.settings.embeddingModel });
		const result = await model.embedContent(content);
		return result.embedding.values || [];
	}

	private generateLocalEmbedding(content: string): Promise<number[]> {
		const endpoint = this.settings.embeddingLocalEndpoint || this.settings.localEndpoint;
		return requestUrl({
			url: `${endpoint}${LOCAL_LLM_EMBEDDINGS_PATH}`,
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: this.settings.embeddingModel || DEFAULT_EMBEDDING_MODELS['local'],
				input: content
			})
		}).then((response) => {
			if (response.status !== 200) {
				throw new Error(`Local embedding error: ${response.status}`);
			}
			const json = response.json as { data: Array<{ embedding: number[] }> };
			return json.data[0]?.embedding || [];
		});
	}

	private generateSimpleEmbedding(content: string): number[] {
		// Simple hash-based embedding for providers without embedding support
		const words = content.toLowerCase().split(/\s+/);
		const embedding = new Array(SIMPLE_EMBEDDING_DIM).fill(0);
		
		words.forEach((word, index) => {
			const hash = this.simpleHash(word);
			const pos = Math.abs(hash) % embedding.length;
			embedding[pos] += 1 / (index + 1); // Weighted by position
		});

		// Normalize
		const magnitude: number = Math.sqrt(embedding.reduce((sum: number, val: number) => sum + val * val, 0));
		return magnitude > 0 ? embedding.map((val: number) => val / magnitude) : embedding;
	}

	private parseAIResponse(response: string): Enhancement {
		try {
			// Clean the response - remove markdown code blocks and extra whitespace
			let cleanResponse = response.trim();
			
			// Remove markdown code blocks if present
			if (cleanResponse.includes('```json')) {
				const jsonStart = cleanResponse.indexOf('```json') + 7;
				const jsonEnd = cleanResponse.lastIndexOf('```');
				if (jsonEnd > jsonStart) {
					cleanResponse = cleanResponse.substring(jsonStart, jsonEnd).trim();
				}
			} else if (cleanResponse.includes('```')) {
				// Handle generic code blocks
				const jsonStart = cleanResponse.indexOf('```') + 3;
				const jsonEnd = cleanResponse.lastIndexOf('```');
				if (jsonEnd > jsonStart) {
					cleanResponse = cleanResponse.substring(jsonStart, jsonEnd).trim();
				}
			}
			
			// Try to find JSON object if there's extra text
			const jsonMatch = cleanResponse.match(/\{[\s\S]*\}/);
			if (jsonMatch) {
				cleanResponse = jsonMatch[0];
			}
			
			// Parse the cleaned JSON
			interface ParsedAIResponse {
				links?: unknown[];
				tags?: unknown[];
				keywords?: unknown[];
				summary?: unknown;
			}
			const parsed = JSON.parse(cleanResponse) as ParsedAIResponse;

			// Format links to ensure they use Obsidian's [[note]] format
			let formattedLinks: string[] = [];
			if (Array.isArray(parsed.links)) {
				formattedLinks = (parsed.links as unknown[])
					.filter((l): l is string => typeof l === 'string' && l.length > 0)
					.map((link: string) => {
						// If the link is already in [[note]] format, keep it
						if (link.startsWith('[[') && link.endsWith(']]')) {
							return link;
						}
						// If it's a plain string like "note title", convert to [[note title]]
						// Remove any quotes that might be in the string
						const cleanLink = link.replace(/['"]/g, '').trim();
						return `[[${cleanLink}]]`;
					});
			}

			// Validate and clean the response
			return {
				tags: Array.isArray(parsed.tags) ? (parsed.tags as unknown[]).filter((t): t is string => typeof t === 'string' && t.length > 0) : [],
				keywords: Array.isArray(parsed.keywords) ? (parsed.keywords as unknown[]).filter((k): k is string => typeof k === 'string' && k.length > 0) : [],
				links: formattedLinks,
				summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : ''
			};
			
		} catch (error) {
			 // Debug logging only in debug mode
			if (this.settings?.debugMode) {
				console.error('Failed to parse AI response:', error);
				console.debug('Raw response:', response);
			}
			
			// Fallback: try to extract information using regex
			return this.extractWithFallback(response);
		}
	}

	private extractWithFallback(response: string): Enhancement {
		// Debug logging only in debug mode
		if (this.settings?.debugMode) {
			console.debug('Using fallback extraction for response:', response);
		}
		
		const result: Enhancement = {
			tags: [],
			keywords: [],
			links: [],
			summary: ''
		};
		
		try {
			// Try to extract tags
			const tagsMatch = response.match(/"tags"\s*:\s*\[([\s\S]*?)\]/);
			if (tagsMatch) {
				const tagsStr = tagsMatch[1];
				result.tags = tagsStr.split(',')
					.map(t => t.trim().replace(/['"]/g, ''))
					.filter(t => t.length > 0);
			}
			
			// Try to extract keywords
			const keywordsMatch = response.match(/"keywords"\s*:\s*\[([\s\S]*?)\]/);
			if (keywordsMatch) {
				const keywordsStr = keywordsMatch[1];
				result.keywords = keywordsStr.split(',')
					.map(k => k.trim().replace(/['"]/g, ''))
					.filter(k => k.length > 0);
			}
			
			// Try to extract links
			const linksMatch = response.match(/"links"\s*:\s*\[([\s\S]*?)\]/);
			if (linksMatch) {
				const linksStr = linksMatch[1];
				result.links = linksStr.split(',')
					.map(l => l.trim().replace(/['"]/g, ''))
					.filter(l => l.length > 0)
					.map(link => {
						// If the link is already in [[note]] format, keep it
						if (link.startsWith('[[') && link.endsWith(']]')) {
							return link;
						}
						// If it's a plain string like "note title", convert to [[note title]]
						// Remove any quotes that might be in the string
						const cleanLink = link.replace(/['"]/g, '').trim();
						return `[[${cleanLink}]]`;
					});
			}
			
			// Try to extract summary
			const summaryMatch = response.match(/"summary"\s*:\s*"([^"]*)"/) || 
							   response.match(/"summary"\s*:\s*'([^']*)'/) ||
							   response.match(/summary[^:]*:\s*(.+?)(?:\n|$)/i);
			if (summaryMatch) {
				result.summary = summaryMatch[1].trim();
			}
			
		} catch (error) {
			// Debug logging only in debug mode
			if (this.settings?.debugMode) {
				console.error('Fallback extraction failed:', error);
			}
		}
		
		return result;
	}

	private simpleHash(str: string): number {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			const char = str.charCodeAt(i);
			hash = ((hash << 5) - hash) + char;
			hash = hash & hash; // Convert to 32-bit integer
		}
		return hash;
	}

	private async withRetry<T>(fn: () => Promise<T>, providerName: string): Promise<T> {
		const delays = RETRY_DELAYS_MS;
		let lastError: unknown;

		for (let attempt = 0; attempt <= delays.length; attempt++) {
			try {
				return await fn();
			} catch (error) {
				lastError = error;
				const status = (error as { status?: number }).status;
				const isRetryable = status === 429 || status === 503;

				if (!isRetryable || attempt === delays.length) break;

				const waitSec = delays[attempt] / 1000;
				const msg = status === 429
					? `${providerName} rate limit hit. Retrying in ${waitSec}s.`
					: `${providerName} service unavailable. Retrying in ${waitSec}s.`;
				new Notice(msg);
				await new Promise(resolve => activeWindow.setTimeout(resolve, delays[attempt]));
			}
		}

		const status = (lastError as { status?: number }).status;
		if (status === 401) {
			throw new SANEError(
				`Invalid API key. Check your ${providerName} key in settings.`,
				String(lastError)
			);
		}
		if (status === 429) {
			throw new SANEError(
				`${providerName} rate limit hit. Please try again later.`,
				String(lastError)
			);
		}
		if (status === 503) {
			throw new SANEError(
				`${providerName} service unavailable. Check your internet connection.`,
				String(lastError)
			);
		}
		throw new SANEError(
			`Could not reach ${providerName}. Check your internet connection.`,
			String(lastError)
		);
	}

	async testConnection(): Promise<{ ok: boolean; message: string }> {
		if (!this.isEmbeddingConfigured()) {
			return { ok: false, message: 'Embedding provider not configured. Enter your API key first.' };
		}
		try {
			await this.generateEmbedding('connection test');
			return { ok: true, message: 'Connection successful!' };
		} catch (error) {
			const msg = error instanceof SANEError
				? error.userMessage
				: (error instanceof Error ? error.message : 'Unknown error');
			return { ok: false, message: msg };
		}
	}

	async testLLM(): Promise<{ ok: boolean; message: string }> {
		if (!this.isConfigured()) {
			return { ok: false, message: 'Provider not configured. Enter your API key first.' };
		}
		try {
			switch (this.settings.aiProvider) {
				case 'openai':
					await this.callOpenAI('hi');
					break;
				case 'google':
					await this.callGoogle('hi');
					break;
				case 'grok':
					await this.callGrok('hi');
					break;
				case 'azure':
					await this.callAzure('hi');
					break;
				case 'local':
					await this.callLocal('hi');
					break;
			}
			return { ok: true, message: 'LLM connected' };
		} catch (error) {
			const msg = error instanceof SANEError
				? error.userMessage
				: (error instanceof Error ? error.message : 'Unknown error');
			return { ok: false, message: msg };
		}
	}

	isEmbeddingConfigured(): boolean {
		switch (this.settings.embeddingProvider) {
			case 'openai':
				return !!this.embeddingOpenaiKey;
			case 'google':
				return !!this.embeddingGoogleKey;
			case 'local':
				return !!(this.settings.embeddingLocalEndpoint || this.settings.localEndpoint);
			default:
				return true; // simple/fallback embedding needs no credentials
		}
	}

	isConfigured(): boolean {
		switch (this.settings.aiProvider) {
			case 'openai':
				return !!this.openaiApiKey;
			case 'google':
				return !!this.googleApiKey;
			case 'grok':
				return !!this.grokApiKey;
			case 'azure':
				return !!this.azureApiKey && !!this.settings.azureEndpoint;
			case 'local':
				return !!this.settings.localEndpoint;
			default:
				return false;
		}
	}
}