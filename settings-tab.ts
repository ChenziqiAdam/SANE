import { App, PluginSettingTab, Setting } from 'obsidian';
import SANEPlugin from './main';

export class SANESettingTab extends PluginSettingTab {
	plugin: SANEPlugin;

	constructor(app: App, plugin: SANEPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		
		containerEl.createEl('h1', { text: 'SANE - Smart AI Note Evolution' });
		containerEl.createEl('p', { 
			text: 'SANE evolves your notes by finding the most relevant notes when you add/edit a note and enhancing them with AI-generated tags, keywords, links, and summaries.',
			cls: 'setting-item-description'
		});

		// AI Provider Configuration
		this.createProviderSettings(containerEl);
		
		// Processing Settings
		this.createProcessingSettings(containerEl);
		
		// Security & Scope Settings
		this.createSecuritySettings(containerEl);
		
		// Feature Toggles
		this.createFeatureSettings(containerEl);
		
		// Cost Management
		this.createCostSettings(containerEl);
		
		// Advanced Settings
		this.createAdvancedSettings(containerEl);
		
		// Actions & Support
		this.createActionsSettings(containerEl);
	}

	private createProviderSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '🤖 AI Provider' });

		new Setting(containerEl)
			.setName('AI Provider')
			.setDesc('Choose your AI provider')
			.addDropdown(dropdown => dropdown
				.addOption('openai', 'OpenAI')
				.addOption('google', 'Google AI')
				.addOption('grok', 'Grok (X.AI)')
				.addOption('azure', 'Azure OpenAI')
				.addOption('local', 'Local LLM (Ollama)')
				.setValue(this.plugin.settings.aiProvider)
				.onChange(async (value: any) => {
					this.plugin.settings.aiProvider = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show relevant settings
				}));

		// Show relevant API key fields based on provider
		this.createProviderSpecificSettings(containerEl);

		// Model selection
		this.createModelSettings(containerEl);
	}

	private createProviderSpecificSettings(containerEl: HTMLElement): void {
		const provider = this.plugin.settings.aiProvider;

		if (provider === 'openai') {
			new Setting(containerEl)
				.setName('OpenAI API Key')
				.setDesc('Your OpenAI API key (starts with sk-)')
				.addText(text => text
					.setPlaceholder('sk-...')
					.setValue(this.plugin.settings.openaiApiKey)
					.onChange(async (value) => {
						this.plugin.settings.openaiApiKey = value;
						await this.plugin.saveSettings();
					}));
		}

		if (provider === 'google') {
			new Setting(containerEl)
				.setName('Google AI API Key')
				.setDesc('Your Google AI Studio API key')
				.addText(text => text
					.setPlaceholder('AIza...')
					.setValue(this.plugin.settings.googleApiKey)
					.onChange(async (value) => {
						this.plugin.settings.googleApiKey = value;
						await this.plugin.saveSettings();
					}));
		}

		if (provider === 'grok') {
			new Setting(containerEl)
				.setName('Grok API Key')
				.setDesc('Your X.AI Grok API key')
				.addText(text => text
					.setPlaceholder('xai-...')
					.setValue(this.plugin.settings.grokApiKey)
					.onChange(async (value) => {
						this.plugin.settings.grokApiKey = value;
						await this.plugin.saveSettings();
					}));
		}

		if (provider === 'azure') {
			new Setting(containerEl)
				.setName('Azure API Key')
				.setDesc('Your Azure OpenAI API key')
				.addText(text => text
					.setPlaceholder('Azure API key')
					.setValue(this.plugin.settings.azureApiKey)
					.onChange(async (value) => {
						this.plugin.settings.azureApiKey = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Azure Endpoint')
				.setDesc('Your Azure OpenAI endpoint URL')
				.addText(text => text
					.setPlaceholder('https://your-resource.openai.azure.com')
					.setValue(this.plugin.settings.azureEndpoint)
					.onChange(async (value) => {
						this.plugin.settings.azureEndpoint = value;
						await this.plugin.saveSettings();
					}));
		}

		if (provider === 'local') {
			new Setting(containerEl)
				.setName('Local Endpoint')
				.setDesc('Your local LLM endpoint (Ollama default: http://localhost:11434)')
				.addText(text => text
					.setPlaceholder('http://localhost:11434')
					.setValue(this.plugin.settings.localEndpoint)
					.onChange(async (value) => {
						this.plugin.settings.localEndpoint = value;
						await this.plugin.saveSettings();
					}));

			// Add help text for local setup
			const helpDiv = containerEl.createDiv({ cls: 'setting-item-description' });
			helpDiv.innerHTML = `
				<p><strong>Local LLM Setup:</strong></p>
				<ol>
					<li>Install <a href="https://ollama.ai">Ollama</a></li>
					<li>Run: <code>ollama pull llama2</code> (or your preferred model)</li>
					<li>Run: <code>ollama pull nomic-embed-text</code> (for embeddings)</li>
					<li>Start Ollama service</li>
				</ol>
			`;
		}
	}

	private createModelSettings(containerEl: HTMLElement): void {
		const provider = this.plugin.settings.aiProvider;
		
		// LLM Model
		new Setting(containerEl)
			.setName('LLM Model')
			.setDesc('Model used for text generation')
			.addText(text => text
				.setPlaceholder(this.getDefaultLLMModel(provider))
				.setValue(this.plugin.settings.llmModel)
				.onChange(async (value) => {
					this.plugin.settings.llmModel = value || this.getDefaultLLMModel(provider);
					await this.plugin.saveSettings();
				}));

		// Embedding Model (if supported)
		if (['openai', 'google', 'local'].includes(provider)) {
			new Setting(containerEl)
				.setName('Embedding Model')
				.setDesc('Model used for generating embeddings')
				.addText(text => text
					.setPlaceholder(this.getDefaultEmbeddingModel(provider))
					.setValue(this.plugin.settings.embeddingModel)
					.onChange(async (value) => {
						this.plugin.settings.embeddingModel = value || this.getDefaultEmbeddingModel(provider);
						await this.plugin.saveSettings();
					}));
		}
	}

	private getDefaultLLMModel(provider: string): string {
		const defaults = {
			openai: 'gpt-4o-mini',
			google: 'gemini-2.0-flash',
			grok: 'grok-3-latest',
			azure: 'gpt-4o-mini',
			local: 'llama3'
		};
		return defaults[provider] || 'gpt-4o-mini';
	}

	private getDefaultEmbeddingModel(provider: string): string {
		const defaults = {
			openai: 'text-embedding-3-small',
			google: 'embedding-001',
			local: 'nomic-embed-text'
		};
		return defaults[provider] || 'text-embedding-3-small';
	}

	private createProcessingSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '⚙️ Processing Configurations' });

		new Setting(containerEl)
			.setName('Relevant Notes Count')
			.setDesc('Number of most relevant notes to update when a note changes (recommended: 3)')
			.addSlider(slider => slider
				.setLimits(1, 10, 1)
				.setValue(this.plugin.settings.relevantNotesCount)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.relevantNotesCount = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Processing Trigger')
			.setDesc('When should SANE process notes?')
			.addDropdown(dropdown => dropdown
				.addOption('immediate', 'Immediate - Process right away')
				.addOption('delayed', 'Delayed - Wait X minutes after editing stops')
				.addOption('scheduled', 'Scheduled - Process once daily at set time')
				.addOption('manual', 'Manual - Only process when commanded')
				.setValue(this.plugin.settings.processingTrigger)
				.onChange(async (value: any) => {
					this.plugin.settings.processingTrigger = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show relevant settings
				}));

		// Show additional settings based on trigger type
		if (this.plugin.settings.processingTrigger === 'delayed') {
			new Setting(containerEl)
				.setName('Delay Minutes')
				.setDesc('Minutes to wait after editing stops before processing')
				.addSlider(slider => slider
					.setLimits(1, 60, 1)
					.setValue(this.plugin.settings.delayMinutes)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.delayMinutes = value;
						await this.plugin.saveSettings();
					}));
		}

		if (this.plugin.settings.processingTrigger === 'scheduled') {
			new Setting(containerEl)
				.setName('Schedule Hour')
				.setDesc('Hour of day to run processing (0-23, recommended: 2 for 2 AM)')
				.addSlider(slider => slider
					.setLimits(0, 23, 1)
					.setValue(this.plugin.settings.scheduleHour)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.scheduleHour = value;
						await this.plugin.saveSettings();
					}));
		}
	}

	private createSecuritySettings(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '🔒 Security & Scope' });

		new Setting(containerEl)
			.setName('Target Folder')
			.setDesc('Only process notes in this folder (leave empty for all folders)')
			.addText(text => text
				.setPlaceholder('e.g., "Notes" or "Knowledge Base"')
				.setValue(this.plugin.settings.targetFolder)
				.onChange(async (value) => {
					this.plugin.settings.targetFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show Privacy Warning')
			.setDesc('Show privacy and backup warning on next startup')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.requireBackupWarning)
				.onChange(async (value) => {
					this.plugin.settings.requireBackupWarning = value;
					this.plugin.settings.privacyWarningShown = !value;
					await this.plugin.saveSettings();
				}));

		// Security notice
		const securityDiv = containerEl.createDiv({ cls: 'setting-item-description' });
		securityDiv.innerHTML = `
			<p><strong>🛡️ Security Reminders:</strong></p>
			<ul>
				<li>Your API keys are stored locally and never shared</li>
				<li>Note content is sent to your chosen AI provider for processing</li>
				<li>SANE adds YAML frontmatter to your notes - backup first!</li>
				<li>Consider using a specific folder to limit scope</li>
			</ul>
		`;
	}

	private createFeatureSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '✨ Enhancement Features' });

		new Setting(containerEl)
			.setName('Generate Tags')
			.setDesc('Add sane_tags to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableTags)
				.onChange(async (value) => {
					this.plugin.settings.enableTags = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Generate Keywords')
			.setDesc('Add sane_keywords to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableKeywords)
				.onChange(async (value) => {
					this.plugin.settings.enableKeywords = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Generate Links')
			.setDesc('Add sane_links to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableLinks)
				.onChange(async (value) => {
					this.plugin.settings.enableLinks = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Generate Summary')
			.setDesc('Add sane_summary to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableSummary)
				.onChange(async (value) => {
					this.plugin.settings.enableSummary = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Add Creation Timestamp')
			.setDesc('Add sane_creation_timestamp to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableCreationTimestamp)
				.onChange(async (value) => {
					this.plugin.settings.enableCreationTimestamp = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Add Modification Timestamp')
			.setDesc('Add sane_modification_timestamp to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableModificationTimestamp)
				.onChange(async (value) => {
					this.plugin.settings.enableModificationTimestamp = value;
					await this.plugin.saveSettings();
				}));
	}

	private createCostSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '💰 Cost Management' });

		new Setting(containerEl)
			.setName('Enable Cost Tracking')
			.setDesc('Track and limit daily spending')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.costTracking)
				.onChange(async (value) => {
					this.plugin.settings.costTracking = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show/hide budget setting
				}));

		if (this.plugin.settings.costTracking) {
			new Setting(containerEl)
				.setName('Daily Budget ($)')
				.setDesc('Maximum amount to spend per day')
				.addSlider(slider => slider
					.setLimits(0.1, 10, 0.1)
					.setValue(this.plugin.settings.dailyBudget)
					.setDynamicTooltip()
					.onChange(async (value) => {
						this.plugin.settings.dailyBudget = value;
						await this.plugin.saveSettings();
					}));
		}

		// Cost estimation help
		const costDiv = containerEl.createDiv({ cls: 'setting-item-description' });
		costDiv.innerHTML = `
			<p><strong>💡 Cost Estimates (per 1000 notes):</strong></p>
			<ul>
				<li><strong>OpenAI:</strong> ~$1.50 (GPT-4) or ~$0.30 (GPT-3.5)</li>
				<li><strong>Google:</strong> ~$0.50 (Gemini Pro)</li>
				<li><strong>Grok:</strong> ~$2.00 (estimated)</li>
				<li><strong>Local:</strong> Free (but requires local setup)</li>
			</ul>
			<p><em>Actual costs depend on note length and enabled features.</em></p>
		`;
	}

	private createAdvancedSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '🔧 Advanced Configurations' });

		new Setting(containerEl)
			.setName('Max Tokens')
			.setDesc('Maximum tokens for AI responses')
			.addSlider(slider => slider
				.setLimits(500, 4000, 100)
				.setValue(this.plugin.settings.maxTokens)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.maxTokens = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Temperature')
			.setDesc('Creativity level (0 = deterministic, 1 = creative)')
			.addSlider(slider => slider
				.setLimits(0, 1, 0.1)
				.setValue(this.plugin.settings.temperature)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.temperature = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Debug Mode')
			.setDesc('Enable debug features and verbose logging')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugMode)
				.onChange(async (value) => {
					this.plugin.settings.debugMode = value;
					await this.plugin.saveSettings();
				}));
	}

	private createActionsSettings(containerEl: HTMLElement): void {
		containerEl.createEl('h2', { text: '🚀 Actions' });

		new Setting(containerEl)
			.setName('Process Current Note')
			.setDesc('Process the currently active note')
			.addButton(button => button
				.setButtonText('Process Now')
				.setClass('mod-cta')
				.onClick(async () => {
					await this.plugin.processCurrentNote();
				}));

		new Setting(containerEl)
			.setName('Initialize All Notes')
			.setDesc('Process all notes in target folder (first-time setup)')
			.addButton(button => button
				.setButtonText('Initialize All')
				.setClass('mod-warning')
				.onClick(async () => {
					await this.plugin.initializeAllNotes();
				}));

		new Setting(containerEl)
			.setName('Show Cost Summary')
			.setDesc('View your usage and costs')
			.addButton(button => button
				.setButtonText('Show Costs')
				.onClick(() => {
					this.plugin.showCostSummary();
				}));

		// Support section
		containerEl.createEl('h2', { text: '❤️ Support SANE' });

		const supportDiv = containerEl.createDiv({ cls: 'setting-item-description' });
		supportDiv.innerHTML = `
			<p><strong>Love SANE? Here's how you can help:</strong></p>
			<ul>
				<li>⭐ <a href="https://github.com/Ghost04718/SANE">Star us on GitHub</a></li>
				<li>☕ <a href="https://buymeacoffee.com/adamchen">Buy us a coffee</a></li>
				<li>🐛 <a href="https://github.com/Ghost04718/SANE/issues">Report bugs</a></li>
				<li>💡 <a href="https://github.com/Ghost04718/SANE/discussions">Suggest features</a></li>
				<li>🧪 Help test local LLM support</li>
				<li>👨‍💻 Contribute to development</li>
			</ul>
		`;

		// Debug info
		containerEl.createEl('h2', { text: '🔍 Debug Info' });
		
		const debugDiv = containerEl.createDiv();
		this.updateDebugInfo(debugDiv);
		
		new Setting(containerEl)
			.setName('Refresh Debug Info')
			.addButton(button => button
				.setButtonText('Refresh')
				.onClick(() => this.updateDebugInfo(debugDiv)));
	}

	private updateDebugInfo(container: HTMLElement): void {
		container.empty();
		
		const aiConfigured = this.plugin.aiProvider?.isConfigured() || false;
		const embeddingsCount = this.plugin['noteEmbeddings']?.size || 0;
		const queueSize = this.plugin['processingQueue']?.size || 0;
		
		container.innerHTML = `
			<p><strong>AI Provider:</strong> ${this.plugin.settings.aiProvider}</p>
			<p><strong>AI Configured:</strong> ${aiConfigured ? 'Yes' : 'No'}</p>
			<p><strong>Notes with Embeddings:</strong> ${embeddingsCount}</p>
			<p><strong>Processing Queue:</strong> ${queueSize}</p>
			<p><strong>Target Folder:</strong> ${this.plugin.settings.targetFolder || 'All folders'}</p>
			<p><strong>Processing Trigger:</strong> ${this.plugin.settings.processingTrigger}</p>
		`;
	}
}