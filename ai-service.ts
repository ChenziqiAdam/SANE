import { Notice, requestUrl } from 'obsidian';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { AIProvider, Enhancement, SANESettings } from './types';

export class UnifiedAIProvider implements AIProvider {
	private settings: SANESettings;
	private openaiClient?: OpenAI;
	private googleClient?: GoogleGenerativeAI;

	constructor(settings: SANESettings) {
		this.settings = settings;
		this.initializeClients();
	}

	private initializeClients(): void {
		if (this.settings.aiProvider === 'openai' && this.settings.openaiApiKey) {
			this.openaiClient = new OpenAI({ 
				apiKey: this.settings.openaiApiKey, 
				dangerouslyAllowBrowser: true 
			});
		} else if (this.settings.aiProvider === 'google' && this.settings.googleApiKey) {
			this.googleClient = new GoogleGenerativeAI(this.settings.googleApiKey);
		}
	}

	updateSettings(settings: SANESettings): void {
		this.settings = settings;
		this.initializeClients();
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
					response = await this.callOpenAI(prompt);
					break;
				case 'google':
					response = await this.callGoogle(prompt);
					break;
				case 'grok':
					response = await this.callGrok(prompt);
					break;
				case 'azure':
					response = await this.callAzure(prompt);
					break;
				case 'local':
					response = await this.callLocal(prompt);
					break;
				default:
					throw new Error(`Unsupported AI provider: ${String(this.settings.aiProvider)}`);
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
			switch (this.settings.aiProvider) {
				case 'openai':
					return await this.generateOpenAIEmbedding(content);
				case 'google':
					return await this.generateGoogleEmbedding(content);
				case 'local':
					return await this.generateLocalEmbedding(content);
				default:
					// For providers without embedding support, use a simple hash-based approach
					return this.generateSimpleEmbedding(content);
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : 'Unknown error';
			new Notice(`Failed to generate embedding: ${errorMessage}`);
			return [];
		}
	}

	estimateCost(tokens: number): number {
		const pricing: Record<string, Record<string, number>> = {
			openai: { gpt4: 0.03, embedding: 0.0001 },
			google: { gemini: 0.0005, embedding: 0.00001 },
			grok: { default: 0.002 },
			azure: { default: 0.03 },
			local: { default: 0 }
		};

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
			url: 'https://api.x.ai/v1/chat/completions',
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${this.settings.grokApiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.settings.llmModel || 'grok-beta',
				messages: [{ role: 'user', content: prompt }],
				max_tokens: this.settings.maxTokens,
				temperature: this.settings.temperature
			})
		});

		if (response.status !== 200) {
			throw new Error(`Grok API error: ${response.status}`);
		}

		return response.json.choices[0]?.message?.content || '';
	}

	private async callAzure(prompt: string): Promise<string> {
		// Azure OpenAI Service
		const response = await requestUrl({
			url: `${this.settings.azureEndpoint}/openai/deployments/${this.settings.llmModel}/chat/completions?api-version=2024-02-15-preview`,
			method: 'POST',
			headers: {
				'api-key': this.settings.azureApiKey,
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

		return response.json.choices[0]?.message?.content || '';
	}

	private callLocal(prompt: string): Promise<string> {
		// Local LLM (Ollama format)
		return requestUrl({
			url: `${this.settings.localEndpoint}/api/generate`,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.settings.llmModel || 'llama2',
				prompt: prompt,
				stream: false
			})
		}).then((response) => {
			if (response.status !== 200) {
				throw new Error(`Local LLM error: ${response.status}`);
			}

			return response.json.response || '';
		});
	}

	private async generateOpenAIEmbedding(content: string): Promise<number[]> {
		if (!this.openaiClient) throw new Error('OpenAI client not initialized');

		const response = await this.openaiClient.embeddings.create({
			model: this.settings.embeddingModel,
			input: content
		});

		return response.data[0].embedding;
	}

	private async generateGoogleEmbedding(content: string): Promise<number[]> {
		if (!this.googleClient) throw new Error('Google client not initialized');

		const model = this.googleClient.getGenerativeModel({ model: this.settings.embeddingModel });
		const result = await model.embedContent(content);
		
		return result.embedding.values || [];
	}

	private generateLocalEmbedding(content: string): Promise<number[]> {
		// Local embedding using Ollama
		return requestUrl({
			url: `${this.settings.localEndpoint}/api/embeddings`,
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				model: this.settings.embeddingModel || 'nomic-embed-text',
				prompt: content
			})
		}).then((response) => {
			if (response.status !== 200) {
				throw new Error(`Local embedding error: ${response.status}`);
			}
			return response.json.embedding || [];
		});
	}

	private generateSimpleEmbedding(content: string): number[] {
		// Simple hash-based embedding for providers without embedding support
		const words = content.toLowerCase().split(/\s+/);
		const embedding = new Array(384).fill(0); // Standard embedding size
		
		words.forEach((word, index) => {
			const hash = this.simpleHash(word);
			const pos = Math.abs(hash) % embedding.length;
			embedding[pos] += 1 / (index + 1); // Weighted by position
		});

		// Normalize
		const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
		return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
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
			const parsed = JSON.parse(cleanResponse);
			
			// Format links to ensure they use Obsidian's [[note]] format
			let formattedLinks: string[] = [];
			if (Array.isArray(parsed.links)) {
				formattedLinks = parsed.links
					.filter(l => typeof l === 'string' && l.length > 0)
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
			
			// Validate and clean the response
			return {
				tags: Array.isArray(parsed.tags) ? parsed.tags.filter(t => typeof t === 'string' && t.length > 0) : [],
				keywords: Array.isArray(parsed.keywords) ? parsed.keywords.filter(k => typeof k === 'string' && k.length > 0) : [],
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

	isConfigured(): boolean {
		switch (this.settings.aiProvider) {
			case 'openai':
				return !!this.settings.openaiApiKey;
			case 'google':
				return !!this.settings.googleApiKey;
			case 'grok':
				return !!this.settings.grokApiKey;
			case 'azure':
				return !!this.settings.azureApiKey && !!this.settings.azureEndpoint;
			case 'local':
				return !!this.settings.localEndpoint;
			default:
				return false;
		}
	}
}