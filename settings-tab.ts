import { App, PluginSettingTab, SecretComponent, Setting } from 'obsidian';
import SANEPlugin from './main';
import { DEFAULT_LLM_MODELS, DEFAULT_EMBEDDING_MODELS, DEFAULT_LOCAL_ENDPOINT } from './constants';

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
			text: 'When you add or edit a note, SANE finds the most relevant notes in your vault and enhances them with AI-generated tags, keywords, links, and summaries.',
			cls: 'setting-item-description'
		});

		// AI provider configuration
		this.createAIConfigSettings(containerEl);

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
		this.createDangerZoneSettings(containerEl);
	}

	private createAIConfigSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('AI configuration')
			.setHeading();

		// --- LLM subsection ---
		new Setting(containerEl)
			.setName('LLM provider')
			.setDesc('Generates tags, keywords, links, and summaries for your notes')
			.addDropdown(dropdown => dropdown
				.addOption('openai', 'OpenAI')
				.addOption('google', 'Google AI')
				.addOption('grok', 'Grok (X.AI)')
				.addOption('azure', 'Azure OpenAI')
				.addOption('local', 'Local LLM (Custom Endpoint)')
				.setValue(this.plugin.settings.aiProvider)
				.onChange(async (value: 'openai' | 'google' | 'grok' | 'azure' | 'local') => {
					this.plugin.settings.aiProvider = value;
					await this.plugin.saveSettings();
					this.display();
				}));

		const llmProvider = this.plugin.settings.aiProvider;

		if (llmProvider === 'openai') {
			new Setting(containerEl)
				.setName('OpenAI API key')
				.setDesc('Starts with sk-')
				.addComponent(el => new SecretComponent(this.app, el)
					.setValue(this.plugin.settings.openaiSecretName)
					.onChange(async (value) => {
						this.plugin.settings.openaiSecretName = value;
						await this.plugin.saveSettings();
					}));
		}

		if (llmProvider === 'google') {
			new Setting(containerEl)
				.setName('Google AI API key')
				.setDesc('From Google AI Studio')
				.addComponent(el => new SecretComponent(this.app, el)
					.setValue(this.plugin.settings.googleSecretName)
					.onChange(async (value) => {
						this.plugin.settings.googleSecretName = value;
						await this.plugin.saveSettings();
					}));
		}

		if (llmProvider === 'grok') {
			new Setting(containerEl)
				.setName('Grok API key')
				.setDesc('From X.AI')
				.addComponent(el => new SecretComponent(this.app, el)
					.setValue(this.plugin.settings.grokSecretName)
					.onChange(async (value) => {
						this.plugin.settings.grokSecretName = value;
						await this.plugin.saveSettings();
					}));
		}

		if (llmProvider === 'azure') {
			new Setting(containerEl)
				.setName('Azure API key')
				.addComponent(el => new SecretComponent(this.app, el)
					.setValue(this.plugin.settings.azureSecretName)
					.onChange(async (value) => {
						this.plugin.settings.azureSecretName = value;
						await this.plugin.saveSettings();
					}));

			new Setting(containerEl)
				.setName('Azure endpoint')
				.addText(text => text
					.setPlaceholder('https://your-resource.openai.azure.com')
					.setValue(this.plugin.settings.azureEndpoint)
					.onChange(async (value) => {
						this.plugin.settings.azureEndpoint = value;
						await this.plugin.saveSettings();
					}));
		}

		if (llmProvider === 'local') {
			new Setting(containerEl)
				.setName('LLM endpoint')
				.setDesc('OpenAI-compatible endpoint (Ollama, vLLM, llama.cpp)')
				.addText(text => text
					.setPlaceholder(DEFAULT_LOCAL_ENDPOINT)
					.setValue(this.plugin.settings.localEndpoint)
					.onChange(async (value) => {
						this.plugin.settings.localEndpoint = value;
						await this.plugin.saveSettings();
					}));
		}

		const llmModelLabel = llmProvider === 'local'
			? 'configured by local server'
			: this.plugin.settings.llmModel;

		new Setting(containerEl)
			.setName('LLM model')
			.setDesc(llmModelLabel)
			.addButton(button => button
				.setButtonText('Test LLM')
				.setClass('mod-cta')
				.onClick(async () => {
					button.setButtonText('Testing…');
					button.setDisabled(true);
					const result = await this.plugin.aiProvider.testLLM();
					button.setButtonText(result.ok ? '✓ Connected' : '✗ Failed');
					button.setDisabled(false);
					setTimeout(() => button.setButtonText('Test LLM'), 3000);
				}));

		// --- Embedding subsection ---
		new Setting(containerEl)
			.setName('Embedding provider')
			.setDesc('Used for semantic similarity search between notes')
			.addDropdown(dropdown => dropdown
				.addOption('openai', 'OpenAI')
				.addOption('google', 'Google AI')
				.addOption('local', 'Local LLM (Custom Endpoint)')
				.setValue(this.plugin.settings.embeddingProvider)
				.onChange(async (value: 'openai' | 'google' | 'local') => {
					this.plugin.settings.embeddingProvider = value;
					this.plugin.settings.embeddingModel = DEFAULT_EMBEDDING_MODELS[value] ?? DEFAULT_EMBEDDING_MODELS['openai'];
					await this.plugin.saveSettings();
					this.display();
				}));

		const embeddingProvider = this.plugin.settings.embeddingProvider;

		if (embeddingProvider === 'openai') {
			new Setting(containerEl)
				.setName('Embedding OpenAI API key')
				.setDesc('Starts with sk-')
				.addComponent(el => new SecretComponent(this.app, el)
					.setValue(this.plugin.settings.embeddingOpenaiSecretName)
					.onChange(async (value) => {
						this.plugin.settings.embeddingOpenaiSecretName = value;
						await this.plugin.saveSettings();
					}));
		}

		if (embeddingProvider === 'google') {
			new Setting(containerEl)
				.setName('Embedding Google AI API key')
				.setDesc('From Google AI Studio')
				.addComponent(el => new SecretComponent(this.app, el)
					.setValue(this.plugin.settings.embeddingGoogleSecretName)
					.onChange(async (value) => {
						this.plugin.settings.embeddingGoogleSecretName = value;
						await this.plugin.saveSettings();
					}));
		}

		if (embeddingProvider === 'local') {
			new Setting(containerEl)
				.setName('Embedding endpoint')
				.setDesc('OpenAI-compatible endpoint for embeddings')
				.addText(text => text
					.setPlaceholder(DEFAULT_LOCAL_ENDPOINT)
					.setValue(this.plugin.settings.embeddingLocalEndpoint)
					.onChange(async (value) => {
						this.plugin.settings.embeddingLocalEndpoint = value;
						await this.plugin.saveSettings();
					}));
		}

		const embeddingModelLabel = embeddingProvider === 'local'
			? 'configured by local server'
			: this.plugin.settings.embeddingModel;

		new Setting(containerEl)
			.setName('Embedding model')
			.setDesc(embeddingModelLabel)
			.addButton(button => button
				.setButtonText('Test Embeddings')
				.setClass('mod-cta')
				.onClick(async () => {
					button.setButtonText('Testing…');
					button.setDisabled(true);
					const result = await this.plugin.aiProvider.testConnection();
					button.setButtonText(result.ok ? '✓ Connected' : '✗ Failed');
					button.setDisabled(false);
					setTimeout(() => button.setButtonText('Test Embeddings'), 3000);
				}));
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
			.setDesc('Only process notes in this folder. Leave empty to process all folders.')
			.addText(text => text
				.setPlaceholder('e.g. Notes or Knowledge Base')
				.setValue(this.plugin.settings.targetFolder)
				.onChange(async (value) => {
					this.plugin.settings.targetFolder = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl('p', {
			text: 'API keys are stored locally. Note content is sent to your chosen AI provider. For complete privacy, use a local LLM.',
			cls: 'setting-item-description'
		});
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
		costDiv.createEl('p').createEl('strong', { text: 'Cost estimates (per 1000 notes):' });
		
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
			.setDesc('Run SANE on the currently active note')
			.addButton(button => button
				.setButtonText('Process now')
				.setClass('mod-cta')
				.onClick(() => {
					void this.plugin.processCurrentNote();
				}));

		new Setting(containerEl)
			.setName('Initialize all notes')
			.setDesc('Process every note in the target folder — use for first-time setup')
			.addButton(button => button
				.setButtonText('Initialize all')
				.onClick(() => {
					this.plugin.initializeAllNotes();
				}));

		new Setting(containerEl)
			.setName('Show cost summary')
			.setDesc('View usage and estimated spend')
			.addButton(button => button
				.setButtonText('Show costs')
				.onClick(() => {
					this.plugin.showCostSummary();
				}));

		new Setting(containerEl)
			.setName('Re-run setup wizard')
			.setDesc('Reconfigure provider, scope, and test your connection')
			.addButton(button => button
				.setButtonText('Open wizard')
				.onClick(() => {
					this.plugin.settings.privacyWarningShown = false;
					this.plugin.settings.requireBackupWarning = false;
					void this.plugin.saveSettings();
					this.plugin.showOnboardingWizard();
				}));

		new Setting(containerEl)
			.setName('Debug info')
			.setHeading()
			.addButton(button => button
				.setButtonText('Refresh')
				.onClick(() => this.updateDebugInfo(debugDiv)));

		const debugDiv = containerEl.createDiv();
		this.updateDebugInfo(debugDiv);
	}

	private createDangerZoneSettings(containerEl: HTMLElement): void {
		new Setting(containerEl)
			.setName('Danger zone')
			.setHeading();

		containerEl.createEl('p', {
			text: 'These actions permanently modify notes in your vault. Make sure you have a backup.',
			cls: 'setting-item-description'
		});

		new Setting(containerEl)
			.setName('Revert current note')
			.setDesc('Remove all SANE-generated frontmatter fields from the active note')
			.addButton(button => button
				.setButtonText('Revert note')
				.setClass('mod-warning')
				.onClick(() => {
					void this.plugin.revertCurrentNote();
				}));

		new Setting(containerEl)
			.setName('Revert all notes')
			.setDesc('Remove all SANE-generated frontmatter from every note in the target folder')
			.addButton(button => button
				.setButtonText('Revert all')
				.setClass('mod-warning')
				.onClick(() => {
					this.plugin.revertAllNotes();
				}));
	}

	private updateDebugInfo(container: HTMLElement): void {
		container.empty();

		const aiConfigured = this.plugin.aiProvider?.isConfigured() || false;
		const embeddingsCount = this.plugin['noteEmbeddings']?.size || 0;
		const queueSize = this.plugin['queue']?.size || 0;

		const infoItems = [
			{ label: 'AI provider', value: this.plugin.settings.aiProvider },
			{ label: 'AI configured', value: aiConfigured ? 'Yes' : 'No' },
			{ label: 'Embedding provider', value: this.plugin.settings.embeddingProvider },
			{ label: 'Notes with embeddings', value: embeddingsCount.toString() },
			{ label: 'Processing queue', value: queueSize.toString() },
			{ label: 'Target folder', value: this.plugin.settings.targetFolder || 'All folders' },
			{ label: 'Processing trigger', value: this.plugin.settings.processingTrigger },
		];

		const dl = container.createEl('dl', { cls: 'sane-debug-info' });
		infoItems.forEach(({ label, value }) => {
			dl.createEl('dt', { text: label });
			dl.createEl('dd', { text: value });
		});

		container.createEl('style', {
			text: `.sane-debug-info { display: grid; grid-template-columns: max-content 1fr; gap: 2px 12px; margin: 8px 0; font-size: var(--font-ui-small); }
.sane-debug-info dt { color: var(--text-muted); }
.sane-debug-info dd { margin: 0; font-family: var(--font-monospace); }`
		});
	}
}