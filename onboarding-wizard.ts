import { App, Modal, Setting } from 'obsidian';
import type SANEPlugin from './main';
import { DEFAULT_LOCAL_ENDPOINT } from './constants';

type Step = 'welcome' | 'provider' | 'scope' | 'done';

export class OnboardingWizard extends Modal {
	private step: Step = 'welcome';
	private backedUp = false;

	constructor(app: App, private plugin: SANEPlugin) {
		super(app);
	}

	onOpen(): void {
		this.render();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	private render(): void {
		const { contentEl } = this;
		contentEl.empty();

		switch (this.step) {
			case 'welcome': this.renderWelcome(); break;
			case 'provider': this.renderProvider(); break;
			case 'scope': this.renderScope(); break;
			case 'done': this.renderDone(); break;
		}
	}

	private renderWelcome(): void {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Welcome to SANE' });
		contentEl.createEl('p', { text: 'SANE automatically enhances your notes with AI-generated tags, keywords, links, and summaries. When you edit a note, SANE finds the most relevant notes in your vault and updates their frontmatter.' });

		contentEl.createEl('h3', { text: 'Privacy notice' });
		const ul = contentEl.createEl('ul');
		ul.createEl('li', { text: 'Your note content is sent to your chosen AI provider for processing.' });
		ul.createEl('li', { text: 'Your API keys are stored locally and never shared.' });
		ul.createEl('li', { text: 'Use the Local LLM option for complete privacy.' });

		contentEl.createEl('h3', { text: 'Before you start' });
		contentEl.createEl('p').createEl('strong', { text: 'SANE adds YAML frontmatter to your notes. Please back up your vault first.' });

		const checkboxDiv = contentEl.createDiv({ cls: 'setting-item' });
		const label = checkboxDiv.createEl('label');
		const checkbox = label.createEl('input', { type: 'checkbox' });
		label.appendText(' I have backed up my vault');

		const nextBtn = contentEl.createDiv({ cls: 'modal-button-container' }).createEl('button', {
			text: 'Next →',
			cls: 'mod-cta'
		});
		nextBtn.disabled = true;

		checkbox.addEventListener('change', () => {
			this.backedUp = checkbox.checked;
			nextBtn.disabled = !this.backedUp;
		});

		nextBtn.addEventListener('click', () => {
			this.step = 'provider';
			this.render();
		});
	}

	private renderProvider(): void {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Step 2: Choose your AI provider' });

		new Setting(contentEl)
			.setName('AI provider')
			.addDropdown(dd => dd
				.addOption('openai', 'OpenAI')
				.addOption('google', 'Google AI')
				.addOption('grok', 'Grok (X.AI)')
				.addOption('azure', 'Azure OpenAI')
				.addOption('local', 'Local LLM (Ollama)')
				.setValue(this.plugin.settings.aiProvider)
				.onChange(async (value: 'openai' | 'google' | 'grok' | 'azure' | 'local') => {
					this.plugin.settings.aiProvider = value;
					await this.plugin.saveSettings();
					this.render();
				}));

		const provider = this.plugin.settings.aiProvider;

		if (provider === 'openai') {
			new Setting(contentEl).setName('OpenAI API key').addText(t => {
				t.setPlaceholder('sk-...')
					.setValue(this.plugin.app.secretStorage.getSecret('sane-openai-api-key') ?? '')
					.onChange(async v => { await this.plugin.saveApiKey('openai', v); await this.plugin.saveSettings(); });
				t.inputEl.type = 'password';
			});
		} else if (provider === 'google') {
			new Setting(contentEl).setName('Google AI API key').addText(t => {
				t.setPlaceholder('AIza...')
					.setValue(this.plugin.app.secretStorage.getSecret('sane-google-api-key') ?? '')
					.onChange(async v => { await this.plugin.saveApiKey('google', v); await this.plugin.saveSettings(); });
				t.inputEl.type = 'password';
			});
		} else if (provider === 'grok') {
			new Setting(contentEl).setName('Grok API key').addText(t => {
				t.setPlaceholder('xai-...')
					.setValue(this.plugin.app.secretStorage.getSecret('sane-grok-api-key') ?? '')
					.onChange(async v => { await this.plugin.saveApiKey('grok', v); await this.plugin.saveSettings(); });
				t.inputEl.type = 'password';
			});
		} else if (provider === 'azure') {
			new Setting(contentEl).setName('Azure API key').addText(t => {
				t.setPlaceholder('Azure API key')
					.setValue(this.plugin.app.secretStorage.getSecret('sane-azure-api-key') ?? '')
					.onChange(async v => { await this.plugin.saveApiKey('azure', v); await this.plugin.saveSettings(); });
				t.inputEl.type = 'password';
			});
			new Setting(contentEl).setName('Azure endpoint').addText(t => t
				.setPlaceholder('https://your-resource.openai.azure.com')
				.setValue(this.plugin.settings.azureEndpoint)
				.onChange(async v => { this.plugin.settings.azureEndpoint = v; await this.plugin.saveSettings(); }));
		} else if (provider === 'local') {
			new Setting(contentEl).setName('Local endpoint').addText(t => t
				.setPlaceholder(DEFAULT_LOCAL_ENDPOINT)
				.setValue(this.plugin.settings.localEndpoint)
				.onChange(async v => { this.plugin.settings.localEndpoint = v; await this.plugin.saveSettings(); }));
		}

		const testDiv = contentEl.createDiv({ cls: 'setting-item' });
		const testBtn = testDiv.createEl('button', { text: 'Test connection' });
		const resultSpan = testDiv.createEl('span', { cls: 'setting-item-description' });
		resultSpan.style.marginLeft = '12px';

		testBtn.addEventListener('click', async () => {
			testBtn.disabled = true;
			resultSpan.setText('Testing…');
			const result = await this.plugin.aiProvider.testConnection();
			resultSpan.setText(result.ok ? '✓ ' + result.message : '✗ ' + result.message);
			resultSpan.style.color = result.ok ? 'var(--color-green)' : 'var(--color-red)';
			testBtn.disabled = false;
		});

		const btnRow = contentEl.createDiv({ cls: 'modal-button-container' });
		btnRow.createEl('button', { text: '← Back' }).addEventListener('click', () => {
			this.step = 'welcome';
			this.render();
		});
		btnRow.createEl('button', { text: 'Next →', cls: 'mod-cta' }).addEventListener('click', () => {
			this.step = 'scope';
			this.render();
		});
	}

	private renderScope(): void {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'Step 3: Set your scope' });

		new Setting(contentEl)
			.setName('Target folder')
			.setDesc('Only process notes in this folder. Leave empty for all folders. Recommended: create a dedicated folder like "Smart Notes".')
			.addText(t => t
				.setPlaceholder('e.g. Smart Notes')
				.setValue(this.plugin.settings.targetFolder)
				.onChange(async v => { this.plugin.settings.targetFolder = v; await this.plugin.saveSettings(); }));

		new Setting(contentEl)
			.setName('Processing trigger')
			.setDesc('Immediate: process on every save. Delayed: wait after editing stops (recommended). Scheduled: once daily. Manual: only when you run the command.')
			.addDropdown(dd => dd
				.addOption('immediate', 'Immediate')
				.addOption('delayed', 'Delayed (recommended)')
				.addOption('scheduled', 'Scheduled daily')
				.addOption('manual', 'Manual only')
				.setValue(this.plugin.settings.processingTrigger)
				.onChange(async (v: 'immediate' | 'delayed' | 'scheduled' | 'manual') => {
					this.plugin.settings.processingTrigger = v;
					await this.plugin.saveSettings();
				}));

		const btnRow = contentEl.createDiv({ cls: 'modal-button-container' });
		btnRow.createEl('button', { text: '← Back' }).addEventListener('click', () => {
			this.step = 'provider';
			this.render();
		});
		btnRow.createEl('button', { text: 'Next →', cls: 'mod-cta' }).addEventListener('click', () => {
			this.step = 'done';
			this.render();
		});
	}

	private renderDone(): void {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: 'You\'re ready!' });

		const summary = contentEl.createEl('ul');
		summary.createEl('li', { text: `Provider: ${this.plugin.settings.aiProvider}` });
		summary.createEl('li', { text: `Folder: ${this.plugin.settings.targetFolder || 'All folders'}` });
		summary.createEl('li', { text: `Trigger: ${this.plugin.settings.processingTrigger}` });

		contentEl.createEl('p', { text: 'SANE will now enhance your notes automatically. You can change any setting in the SANE settings tab.' });

		const btnRow = contentEl.createDiv({ cls: 'modal-button-container' });

		btnRow.createEl('button', { text: 'I\'ll process manually' }).addEventListener('click', () => {
			this.plugin.settings.privacyWarningShown = true;
			void this.plugin.saveSettings();
			this.close();
		});

		btnRow.createEl('button', { text: 'Process all notes now', cls: 'mod-cta' }).addEventListener('click', () => {
			this.plugin.settings.privacyWarningShown = true;
			void this.plugin.saveSettings();
			this.close();
			this.plugin.initializeAllNotes();
		});
	}
}
