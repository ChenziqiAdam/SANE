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
		
		// Remove top-level heading
		containerEl.createEl('p', { 
			text: 'SANE evolves your notes by finding the most relevant notes when you add/edit a note and enhancing them with AI-generated tags, keywords, links, and summaries',
			cls: 'setting-item-description'
		});

		// AI provider configuration
		this.createProviderSettings(containerEl);
		
		// Processing settings
		this.createProcessingSettings(containerEl);
		
		// Security & scope settings
		this.createSecuritySettings(containerEl);
		
		// Feature toggles
		this.createFeatureSettings(containerEl);
		
		// Cost management
		this.createCostSettings(containerEl);
		
		// Advanced settings
		this.createAdvancedSettings(containerEl);
		
		// Actions & support
		this.createActionsSettings(containerEl);
	}

	private createProviderSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('AI provider')
			.setHeading();

		new Setting(containerEl)
			.setName('AI provider')
			.setDesc('Choose your AI provider')
			.addDropdown(dropdown => dropdown
				.addOption('openai', 'OpenAI')
				.addOption('google', 'Google AI')
				.addOption('grok', 'Grok (X.AI)')
				.addOption('azure', 'Azure OpenAI')
				.addOption('local', 'Local LLM (Ollama)')
				.setValue(this.plugin.settings.aiProvider)
				.onChange(async (value: 'openai' | 'google' | 'grok' | 'azure' | 'local') => {
					this.plugin.settings.aiProvider = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show relevant settings
				}));

		this.createProviderSpecificSettings(containerEl);
		this.createModelSettings(containerEl);
	}

	private createProviderSpecificSettings(containerEl: HTMLElement): void {
		const provider = this.plugin.settings.aiProvider;

		if (provider === 'openai') {
			new Setting(containerEl)
				.setName('OpenAI API key')
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
				.setName('Google AI API key')
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
				.setName('Grok API key')
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
				.setName('Azure API key')
				.setDesc('Your Azure OpenAI API key')
				.addText(text => text
					.setPlaceholder('Azure API key')
					.setValue(this.plugin.settings.azureApiKey)
					.onChange(async (value) => {
						this.plugin.settings.azureApiKey = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Azure endpoint')
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
				.setName('Local endpoint')
				.setDesc('Your local LLM endpoint (Ollama default: http://localhost:11434)')
				.addText(text => text
					.setPlaceholder('http://localhost:11434')
					.setValue(this.plugin.settings.localEndpoint)
					.onChange(async (value) => {
						this.plugin.settings.localEndpoint = value;
						await this.plugin.saveSettings();
					}));

			const helpDiv = containerEl.createDiv({ cls: 'setting-item-description' });
			const title = helpDiv.createEl('p');
			title.createEl('strong', { text: 'Local LLM setup:' });
			
			const ol = helpDiv.createEl('ol');
			
			const li1 = ol.createEl('li');
			li1.appendText('Install ');
			li1.createEl('a', { href: 'https://ollama.ai', text: 'Ollama' });
			
			const li2 = ol.createEl('li');
			li2.appendText('Run: ');
			li2.createEl('code', { text: 'ollama pull llama2' });
			li2.appendText(' (or your preferred model)');
			
			const li3 = ol.createEl('li');
			li3.appendText('Run: ');
			li3.createEl('code', { text: 'ollama pull nomic-embed-text' });
			li3.appendText(' (for embeddings)');
			
			ol.createEl('li', { text: 'Start Ollama service' });
		}
	}

	private createModelSettings(containerEl: HTMLElement): void {
		const provider = this.plugin.settings.aiProvider;
		
		new Setting(containerEl)
			.setName('LLM model')
			.setDesc('Model used for text generation')
			.addText(text => text
				.setPlaceholder(this.getDefaultLLMModel(provider))
				.setValue(this.plugin.settings.llmModel)
				.onChange(async (value) => {
					this.plugin.settings.llmModel = value || this.getDefaultLLMModel(provider);
					await this.plugin.saveSettings();
				}));

		if (['openai', 'google', 'local'].includes(provider)) {
			new Setting(containerEl)
				.setName('Embedding model')
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
		new Setting(containerEl)
			.setName('Processing management')
			.setHeading();

		new Setting(containerEl)
			.setName('Relevant notes count')
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
			.setName('Processing trigger')
			.setDesc('When should SANE process notes?')
			.addDropdown(dropdown => dropdown
				.addOption('immediate', 'Immediate - process right away')
				.addOption('delayed', 'Delayed - wait X minutes after editing stops')
				.addOption('scheduled', 'Scheduled - process once daily at set time')
				.addOption('manual', 'Manual - only process when commanded')
				.setValue(this.plugin.settings.processingTrigger)
				.onChange(async (value: 'immediate' | 'delayed' | 'scheduled' | 'manual') => {
					this.plugin.settings.processingTrigger = value;
					await this.plugin.saveSettings();
					this.display(); // Refresh to show relevant settings
				}));

		if (this.plugin.settings.processingTrigger === 'delayed') {
			new Setting(containerEl)
				.setName('Delay minutes')
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
				.setName('Schedule hour')
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
		new Setting(containerEl)
			.setName('Security & scope')
			.setHeading();

		new Setting(containerEl)
			.setName('Target folder')
			.setDesc('Only process notes in this folder (leave empty for all folders)')
			.addText(text => text
				.setPlaceholder('e.g., "Notes" or "Knowledge Base"')
				.setValue(this.plugin.settings.targetFolder)
				.onChange(async (value) => {
					this.plugin.settings.targetFolder = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Show privacy warning')
			.setDesc('Show privacy and backup warning on next startup')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.requireBackupWarning)
				.onChange(async (value) => {
					this.plugin.settings.requireBackupWarning = value;
					this.plugin.settings.privacyWarningShown = !value;
					await this.plugin.saveSettings();
				}));

		const securityDiv = containerEl.createDiv({ cls: 'setting-item-description' });
		securityDiv.createEl('p').createEl('strong', { text: '🛡️ Security reminders:' });
		
		const securityList = securityDiv.createEl('ul');
		securityList.createEl('li', { text: 'Your API keys are stored locally and never shared' });
		securityList.createEl('li', { text: 'Note content is sent to your chosen AI provider for processing' });
		securityList.createEl('li', { text: 'SANE adds YAML frontmatter to your notes - backup first!' });
		securityList.createEl('li', { text: 'Consider using a specific folder to limit scope' });
	}

	private createFeatureSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Enhancement features')
			.setHeading();

		new Setting(containerEl)
			.setName('Generate tags')
			.setDesc('Add sane_tags to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableTags)
				.onChange(async (value) => {
					this.plugin.settings.enableTags = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Generate keywords')
			.setDesc('Add sane_keywords to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableKeywords)
				.onChange(async (value) => {
					this.plugin.settings.enableKeywords = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Generate links')
			.setDesc('Add sane_links to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableLinks)
				.onChange(async (value) => {
					this.plugin.settings.enableLinks = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Generate summary')
			.setDesc('Add sane_summary to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableSummary)
				.onChange(async (value) => {
					this.plugin.settings.enableSummary = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Add creation timestamp')
			.setDesc('Add created_at to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableCreationTimestamp)
				.onChange(async (value) => {
					this.plugin.settings.enableCreationTimestamp = value;
					await this.plugin.saveSettings();
				}));

		new Setting(containerEl)
			.setName('Add modification timestamp')
			.setDesc('Add modified_at to note frontmatter')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableModificationTimestamp)
				.onChange(async (value) => {
					this.plugin.settings.enableModificationTimestamp = value;
					await this.plugin.saveSettings();
				}));
	}

	private createCostSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Cost management')
			.setHeading();

		new Setting(containerEl)
			.setName('Enable cost tracking')
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
				.setName('Daily budget ($)')
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

		const costDiv = containerEl.createDiv({ cls: 'setting-item-description' });
		costDiv.createEl('p').createEl('strong', { text: '💡 Cost estimates (per 1000 notes):' });
		
		const costList = costDiv.createEl('ul');
		
		const openaiLi = costList.createEl('li');
		openaiLi.createEl('strong', { text: 'OpenAI:' });
		openaiLi.appendText(' ~$1.50 (GPT-4) or ~$0.30 (GPT-3.5)');
		
		const googleLi = costList.createEl('li');
		googleLi.createEl('strong', { text: 'Google:' });
		googleLi.appendText(' ~$0.50 (Gemini Pro)');
		
		const grokLi = costList.createEl('li');
		grokLi.createEl('strong', { text: 'Grok:' });
		grokLi.appendText(' ~$2.00 (estimated)');
		
		const localLi = costList.createEl('li');
		localLi.createEl('strong', { text: 'Local:' });
		localLi.appendText(' Free (but requires local setup)');
		
		const note = costDiv.createEl('p');
		note.createEl('em', { text: 'Actual costs depend on note length and enabled features' });
	}

	private createAdvancedSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Advanced')
			.setHeading();

		new Setting(containerEl)
			.setName('Max tokens')
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
			.setName('Debug mode')
			.setDesc('Enable debug features and verbose logging')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.debugMode)
				.onChange(async (value) => {
					this.plugin.settings.debugMode = value;
					await this.plugin.saveSettings();
				}));
	}

	private createActionsSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Actions')
			.setHeading();

		new Setting(containerEl)
			.setName('Process current note')
			.setDesc('Process the currently active note')
			.addButton(button => button
				.setButtonText('Process now')
				.setClass('mod-cta')
				.onClick(() => {
					void this.plugin.processCurrentNote();
				}));

		new Setting(containerEl)
			.setName('Initialize all notes')
			.setDesc('Process all notes in target folder (first-time setup)')
			.addButton(button => button
				.setButtonText('Initialize all')
				.setClass('mod-warning')
				.onClick(() => {
					this.plugin.initializeAllNotes();
				}));

		new Setting(containerEl)
			.setName('Show cost summary')
			.setDesc('View your usage and costs')
			.addButton(button => button
				.setButtonText('Show costs')
				.onClick(() => {
					this.plugin.showCostSummary();
				}));

		new Setting(containerEl)
			.setName('Support SANE')
			.setHeading();

		const supportDiv = containerEl.createDiv({ cls: 'setting-item-description' });
		supportDiv.createEl('p').createEl('strong', { text: 'Love SANE? Here\'s how you can help:' });
		
		const supportList = supportDiv.createEl('ul');
		
		const starLi = supportList.createEl('li');
		starLi.appendText('⭐ ');
		starLi.createEl('a', { href: 'https://github.com/Ghost04718/SANE', text: 'Star us on GitHub' });
		
		const coffeeLi = supportList.createEl('li');
		coffeeLi.appendText('☕ ');
		coffeeLi.createEl('a', { href: 'https://buymeacoffee.com/adamchen', text: 'Buy us a coffee' });
		
		const bugsLi = supportList.createEl('li');
		bugsLi.appendText('🐛 ');
		bugsLi.createEl('a', { href: 'https://github.com/Ghost04718/SANE/issues', text: 'Report bugs' });
		
		const featuresLi = supportList.createEl('li');
		featuresLi.appendText('💡 ');
		featuresLi.createEl('a', { href: 'https://github.com/Ghost04718/SANE/discussions', text: 'Suggest features' });
		
		supportList.createEl('li', { text: '🧪 Help test local LLM support' });
		supportList.createEl('li', { text: '👨‍💻 Contribute to development' });

		new Setting(containerEl)
			.setName('Debug info')
			.setHeading();
		
		const debugDiv = containerEl.createDiv();
		this.updateDebugInfo(debugDiv);
		
		new Setting(containerEl)
			.setName('Refresh debug info')
			.addButton(button => button
				.setButtonText('Refresh')
				.onClick(() => this.updateDebugInfo(debugDiv)));
	}

	private updateDebugInfo(container: HTMLElement): void {
		container.empty();
		
		const aiConfigured = this.plugin.aiProvider?.isConfigured() || false;
		const embeddingsCount = this.plugin['noteEmbeddings']?.size || 0;
		const queueSize = this.plugin['processingQueue']?.size || 0;
		
		const infoItems = [
			{ label: 'AI provider:', value: this.plugin.settings.aiProvider },
			{ label: 'AI configured:', value: aiConfigured ? 'Yes' : 'No' },
			{ label: 'Notes with embeddings:', value: embeddingsCount.toString() },
			{ label: 'Processing queue:', value: queueSize.toString() },
			{ label: 'Target folder:', value: this.plugin.settings.targetFolder || 'All folders' },
			{ label: 'Processing trigger:', value: this.plugin.settings.processingTrigger }
		];
		
		infoItems.forEach(item => {
			const p = container.createEl('p');
			p.createEl('strong', { text: item.label });
			p.appendText(' ' + item.value);
		});
	}
}