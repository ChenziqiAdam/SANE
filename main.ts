import { Notice, Plugin, TFile, addIcon, Modal, App } from 'obsidian';
import { SANESettings, DEFAULT_SETTINGS, NoteEmbedding, RelevantNote, Enhancement, CostEntry, StoredEmbedding, PluginData, QueueStatus } from './types';
import { SANESettingTab } from './settings-tab';
import { UnifiedAIProvider } from './ai-service';
import { ProcessingQueue } from './processing-queue';
import { OnboardingWizard } from './onboarding-wizard';

// Simple brain icon for the plugin
const BRAIN_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12 3C8.13 3 5 6.13 5 10c0 1.74.63 3.34 1.68 4.58L12 21l5.32-6.42C18.37 13.34 19 11.74 19 10c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/>
</svg>`;

export default class SANEPlugin extends Plugin {
	settings: SANESettings;
	aiProvider: UnifiedAIProvider;
	
	private noteEmbeddings: Map<string, NoteEmbedding> = new Map();
	private queue: ProcessingQueue;
	private costEntries: CostEntry[] = [];

	async onload() {
		await this.loadSettings();
		const keys = await this.loadApiKeys();

		console.debug('Loading SANE - Smart AI note evolution');

		addIcon('sane-brain', BRAIN_ICON);

		this.aiProvider = new UnifiedAIProvider(this.settings, keys);

		this.queue = new ProcessingQueue(
			(file) => this.processNote(file),
			this.settings
		);

		const statusBar = this.addStatusBarItem();
		statusBar.setText(this.aiProvider.isConfigured() ? 'SANE: idle' : 'SANE: not configured');

		this.queue.onStatusChange((status: QueueStatus) => {
			switch (status.type) {
				case 'idle':
					statusBar.setText(this.aiProvider?.isConfigured() ? 'SANE: idle' : 'SANE: not configured');
					break;
				case 'processing':
					statusBar.setText(`SANE: processing (${status.queued + 1} queued)`);
					break;
				case 'error':
					statusBar.setText('SANE: error — click for details');
					statusBar.title = status.message;
					break;
			}
		});

		if (this.settings.processingTrigger === 'scheduled') {
			this.queue.scheduleDaily();
		}

		if (!this.settings.privacyWarningShown || this.settings.requireBackupWarning) {
			this.showOnboardingWizard();
		}

		this.registerEventHandlers();
		this.addCommands();
		this.addSettingTab(new SANESettingTab(this.app, this));

		this.addRibbonIcon('sane-brain', 'SANE: Process current note', () => {
			void this.processCurrentNote();
		});

		new Notice('SANE - Smart AI note evolution loaded');
	}

	onunload(): void {
		console.debug('Unloading SANE');
		void this.queue?.drain().then(() => {
			void this.saveSettings();
		});
	}

	async loadApiKeys(): Promise<Record<string, string>> {
		const ss = this.app.secretStorage;
		return {
			openai: ss.getSecret('sane-openai-api-key') ?? '',
			google: ss.getSecret('sane-google-api-key') ?? '',
			grok:   ss.getSecret('sane-grok-api-key') ?? '',
			azure:  ss.getSecret('sane-azure-api-key') ?? '',
		};
	}

	async saveApiKey(provider: 'openai' | 'google' | 'grok' | 'azure', value: string): Promise<void> {
		const idMap: Record<string, string> = {
			openai: 'sane-openai-api-key',
			google: 'sane-google-api-key',
			grok:   'sane-grok-api-key',
			azure:  'sane-azure-api-key',
		};
		this.app.secretStorage.setSecret(idMap[provider], value);
	}

	async loadSettings() {
		const stored = await this.loadData() as PluginData | null;
		this.settings = Object.assign({}, DEFAULT_SETTINGS, stored?.settings ?? {});

		// Migrate from localStorage if needed
		const legacy = this.app.loadLocalStorage('sane-embeddings');
		if (legacy) {
			try {
				const pairs = JSON.parse(legacy) as [string, NoteEmbedding][];
				for (const [path, ne] of pairs) {
					this.noteEmbeddings.set(path, ne);
				}
				this.app.saveLocalStorage('sane-embeddings', '');
			} catch {
				// Ignore corrupt legacy data
			}
		}

		if (stored?.embeddings) {
			for (const [path, se] of Object.entries(stored.embeddings)) {
				this.noteEmbeddings.set(path, {
					path,
					content: '',
					embedding: se.embedding,
					lastUpdated: se.lastUpdated
				});
			}
		}
	}

	async saveSettings() {
		const embeddings: Record<string, StoredEmbedding> = {};
		for (const [path, ne] of this.noteEmbeddings) {
			embeddings[path] = { embedding: ne.embedding, lastUpdated: ne.lastUpdated };
		}
		const data: PluginData = { settings: this.settings, embeddings };
		await this.saveData(data);

		if (this.aiProvider) {
			this.aiProvider.updateSettings(this.settings);
			const keys = await this.loadApiKeys();
			this.aiProvider.updateKeys(keys);
		}
		if (this.queue) {
			this.queue.updateSettings(this.settings);
		}
	}

	public showOnboardingWizard(): void {
		const wizard = new OnboardingWizard(this.app, this);
		wizard.open();
	}

	private registerEventHandlers(): void {
		// Note creation handler
		this.registerEvent(
			this.app.vault.on('create', (file) => {
				if (file instanceof TFile && this.shouldProcessFile(file)) {
					void this.handleNoteChange(file);
				}
			})
		);

		// Note modification handler
		this.registerEvent(
			this.app.vault.on('modify', (file) => {
				if (file instanceof TFile && this.shouldProcessFile(file)) {
					void this.handleNoteChange(file);
				}
			})
		);

		// Note deletion handler
		this.registerEvent(
			this.app.vault.on('delete', (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.noteEmbeddings.delete(file.path);
				}
			})
		);
	}

	private shouldProcessFile(file: TFile): boolean {
		if (!file || file.extension !== 'md') {
			return false;
		}

		// Check if file is in target folder (if specified)
		if (this.settings.targetFolder) {
			return file.path.startsWith(this.settings.targetFolder + '/') || 
				   file.parent?.path === this.settings.targetFolder;
		}

		return true;
	}

	private async handleNoteChange(file: TFile): Promise<void> {
		this.queue.enqueue(file);
	}

	private async processNote(file: TFile): Promise<void> {
		if (!this.aiProvider?.isConfigured()) {
			new Notice('AI provider not configured. Please check settings.');
			return;
		}

		if (this.settings.debugMode) {
			console.debug(`SANE: Processing note ${file.path}`);
		}

		try {
			const content = await this.app.vault.read(file);
			const cleanContent = this.cleanContent(content);

			const embedding = await this.aiProvider.generateEmbedding(cleanContent);
			if (embedding.length === 0) return;

			this.noteEmbeddings.set(file.path, {
				path: file.path,
				content: cleanContent,
				embedding,
				lastUpdated: Date.now()
			});

			const relevantNotes = this.findRelevantNotes(file.path, this.settings.relevantNotesCount);

			// Update related notes, passing current note's content as context
			for (const relevantNote of relevantNotes) {
				await this.updateNoteWithAI(relevantNote.file, [cleanContent]);
			}

			// Always enhance the current note with related notes' content as context
			const relatedContents = relevantNotes
				.map(r => this.noteEmbeddings.get(r.file.path)?.content)
				.filter((c): c is string => typeof c === 'string' && c.length > 0);

			await this.updateNoteWithAI(file, relatedContents);

		} catch (error) {
			if (error instanceof Error && error.message.includes('budget')) {
				new Notice('Daily budget reached. Processing paused until tomorrow.');
			} else {
				new Notice(`Error processing note: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		}
	}

	private findRelevantNotes(excludePath: string, count: number): RelevantNote[] {
		const currentEmbedding = this.noteEmbeddings.get(excludePath);
		if (!currentEmbedding) return [];

		const similarities: RelevantNote[] = [];

		for (const [path, noteEmbedding] of this.noteEmbeddings) {
			if (path === excludePath) continue;

			const file = this.app.vault.getAbstractFileByPath(path);
			if (!(file instanceof TFile)) continue;

			const similarity = this.cosineSimilarity(currentEmbedding.embedding, noteEmbedding.embedding);
			similarities.push({ file, similarity });
		}

		// Return top N most similar notes
		return similarities
			.sort((a, b) => b.similarity - a.similarity)
			.slice(0, count);
	}

	private cosineSimilarity(a: number[], b: number[]): number {
		if (a.length !== b.length) return 0;

		let dotProduct = 0;
		let normA = 0;
		let normB = 0;

		for (let i = 0; i < a.length; i++) {
			dotProduct += a[i] * b[i];
			normA += a[i] * a[i];
			normB += b[i] * b[i];
		}

		if (normA === 0 || normB === 0) return 0;
		return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
	}

	private async updateNoteWithAI(file: TFile, relatedContent: string[]): Promise<void> {
		const content = await this.app.vault.read(file);
		const cleanContent = this.cleanContent(content);

		// Check daily budget
		if (this.settings.costTracking && !this.canAffordProcessing()) {
			throw new Error('Would exceed daily budget');
		}

		// Generate enhancement
		const enhancement = await this.aiProvider.generateEnhancement(cleanContent, relatedContent);

		// Record cost
		if (this.settings.costTracking) {
			this.recordCost('enhancement', this.estimateTokens(cleanContent));
		}

		// Apply enhancement to note
		await this.applyEnhancement(file, enhancement);
	}

	private async applyEnhancement(file: TFile, enhancement: Enhancement): Promise<void> {
		// Use processFrontMatter to atomically update frontmatter
		await this.app.fileManager.processFrontMatter(file, (frontmatter: Record<string, unknown>) => {
			// Add/update SANE enhancements
			if (this.settings.enableTags && enhancement.tags.length > 0) {
				frontmatter.sane_tags = enhancement.tags;
			}
			if (this.settings.enableKeywords && enhancement.keywords.length > 0) {
				frontmatter.sane_keywords = enhancement.keywords;
			}
			if (this.settings.enableLinks && enhancement.links.length > 0) {
				frontmatter.sane_links = enhancement.links;
			}
			if (this.settings.enableSummary && enhancement.summary) {
				frontmatter.sane_summary = enhancement.summary;
			}
			if (this.settings.enableCreationTimestamp) {
				const creationDate = new Date(file.stat.ctime);
				frontmatter.created_at = creationDate.toISOString();
			}
			if (this.settings.enableModificationTimestamp) {
				const modificationDate = new Date(file.stat.mtime);
				frontmatter.modified_at = modificationDate.toISOString();
			}

			// Add metadata
			frontmatter.sane_updated = new Date().toISOString();
			frontmatter.sane_version = '1.0';
		});
	}

	private cleanContent(content: string): string {
		// Remove frontmatter
		content = content.replace(/^---[\s\S]*?---\n?/, '');
		
		// Keep it simple - just clean basic markdown
		return content
			.replace(/!\[\[.*?\]\]/g, '') // Remove image embeds
			.replace(/```[\s\S]*?```/g, '') // Remove code blocks
			.trim();
	}

	// Cost management
	private canAffordProcessing(): boolean {
		if (!this.settings.costTracking) return true;

		const today = new Date().toDateString();
		const todayCosts = this.costEntries
			.filter(entry => new Date(entry.timestamp).toDateString() === today)
			.reduce((sum, entry) => sum + entry.cost, 0);

		return todayCosts < this.settings.dailyBudget;
	}

	private recordCost(operation: string, tokens: number): void {
		const cost = this.aiProvider.estimateCost(tokens);
		this.costEntries.push({
			timestamp: Date.now(),
			operation,
			cost,
			provider: this.settings.aiProvider
		});

		// Keep only last 30 days
		const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
		this.costEntries = this.costEntries.filter(entry => entry.timestamp >= thirtyDaysAgo);
	}

	private estimateTokens(text: string): number {
		return Math.ceil(text.split(/\s+/).length / 0.75);
	}

	// Commands
	private addCommands(): void {
		this.addCommand({
			id: 'process-current-note',
			name: 'Process current note',
			callback: () => {
				void this.processCurrentNote();
			}
		});

		this.addCommand({
			id: 'process-all-notes',
			name: 'Initialize: Process all notes in target folder',
			callback: () => {
				this.initializeAllNotes();
			}
		});

		this.addCommand({
			id: 'show-cost-summary',
			name: 'Show cost summary',
			callback: () => {
				this.showCostSummary();
			}
		});

		this.addCommand({
			id: 'revert-current-note',
			name: 'Revert current note: remove all SANE fields',
			callback: () => {
				void this.revertCurrentNote();
			}
		});

		this.addCommand({
			id: 'revert-all-notes',
			name: 'Revert all notes in target folder: remove all SANE fields',
			callback: () => {
				this.revertAllNotes();
			}
		});

		// Add debug command if debug mode is enabled
		if (this.settings?.debugMode) {
			this.addCommand({
				id: 'test-ai-response',
				name: 'Test AI response (debug)',
				callback: () => {
					void this.testAIResponse();
				}
			});
		}
	}

	public async processCurrentNote(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file to process');
			return;
		}

		if (!this.shouldProcessFile(activeFile)) {
			new Notice('Current file is not in the target folder or is not a markdown file');
			return;
		}

		await this.processNote(activeFile);
		new Notice('Current note processed');
	}

	public initializeAllNotes(): void {
		const modal = new ConfirmModal(
			this.app, 
			'Initialize all notes',
			'This will process all notes in the target folder. This may take time and use API credits. Continue?',
			() => {
				void this.performInitializeAllNotes();
			}
		);
		modal.open();
	}

	private async performInitializeAllNotes(): Promise<void> {
		const allFiles = this.app.vault.getMarkdownFiles();
		const targetFiles = allFiles.filter(file => this.shouldProcessFile(file));

		new Notice(`Initializing ${targetFiles.length} notes...`);

		for (let i = 0; i < targetFiles.length; i++) {
			const file = targetFiles[i];
			
			try {
				await this.processNote(file);
				
				if (i % 10 === 0) {
					new Notice(`Processed ${i + 1}/${targetFiles.length} notes`, 2000);
				}

				// Small delay to avoid overwhelming the API
				await new Promise(resolve => activeWindow.setTimeout(resolve, 100));

			} catch (error) {
				if (this.settings?.debugMode) {
					console.error(`Error processing ${file.path}:`, error);
				}
				if (error instanceof Error && error.message.includes('budget')) {
					new Notice('Daily budget reached. Initialization paused');
					break;
				}
			}
		}

		new Notice('Initialization complete');
	}

	public showCostSummary(): void {
		const today = new Date().toDateString();
		const todayCosts = this.costEntries
			.filter(entry => new Date(entry.timestamp).toDateString() === today)
			.reduce((sum, entry) => sum + entry.cost, 0);

		const thisMonth = new Date();
		thisMonth.setDate(1);
		const monthlyCosts = this.costEntries
			.filter(entry => entry.timestamp >= thisMonth.getTime())
			.reduce((sum, entry) => sum + entry.cost, 0);

		const message = `💰 SANE cost summary:

📅 Today: ${todayCosts.toFixed(4)} / ${this.settings.dailyBudget}
📆 This month: ${monthlyCosts.toFixed(4)}
🔄 Total API calls: ${this.costEntries.length}
🧠 Notes with embeddings: ${this.noteEmbeddings.size}

Provider: ${this.settings.aiProvider}`;

		new Notice(message, 10000);
	}

	private async revertNote(file: TFile): Promise<void> {
		await this.app.fileManager.processFrontMatter(file, (fm: Record<string, unknown>) => {
			delete fm['sane_tags'];
			delete fm['sane_keywords'];
			delete fm['sane_links'];
			delete fm['sane_summary'];
			delete fm['sane_updated'];
			delete fm['sane_version'];
			if ('created_at' in fm && 'modified_at' in fm) {
				delete fm['created_at'];
				delete fm['modified_at'];
			}
		});
		this.noteEmbeddings.delete(file.path);
	}

	public async revertCurrentNote(): Promise<void> {
		const activeFile = this.app.workspace.getActiveFile();
		if (!activeFile) {
			new Notice('No active file to revert');
			return;
		}
		await this.revertNote(activeFile);
		new Notice(`SANE fields removed from ${activeFile.name}`);
	}

	public revertAllNotes(): void {
		const allFiles = this.app.vault.getMarkdownFiles();
		const targetFiles = allFiles.filter(file => this.shouldProcessFile(file));
		const modal = new ConfirmModal(
			this.app,
			'Revert all notes',
			`This will remove all SANE fields from ${targetFiles.length} notes. Continue?`,
			() => { void this.performRevertAllNotes(targetFiles); }
		);
		modal.open();
	}

	private async performRevertAllNotes(files: TFile[]): Promise<void> {
		new Notice(`Reverting ${files.length} notes…`);
		for (let i = 0; i < files.length; i++) {
			await this.revertNote(files[i]);
			if (i % 10 === 0 && i > 0) {
				new Notice(`Reverted ${i}/${files.length} notes`, 2000);
			}
		}
		this.noteEmbeddings.clear();
		await this.saveSettings();
		new Notice(`SANE fields removed from ${files.length} notes`);
	}

	private testAIResponse(): Promise<void> {
		if (!this.aiProvider?.isConfigured()) {
			new Notice('AI provider not configured');
			return Promise.resolve();
		}

		return (async () => {
			try {
				new Notice('Testing AI response format...');
				
				const testContent = "This is a test note about machine learning and artificial intelligence. It discusses neural networks and their applications in modern AI systems.";
				const testRelated = ["Introduction to AI: Basic concepts", "Neural Networks: Deep dive"];
				
				if (this.settings.debugMode) {
					console.debug('Testing AI response with:', { testContent, testRelated });
				}
				
				const enhancement = await this.aiProvider.generateEnhancement(testContent, testRelated);
				
				if (this.settings.debugMode) {
					console.debug('AI enhancement result:', enhancement);
				}
				
				const message = `🧪 AI test results:
Tags: ${enhancement.tags.join(', ')}
Keywords: ${enhancement.keywords.join(', ')}
Links: ${enhancement.links.join(', ')}
Summary: ${enhancement.summary}`;

				new Notice(message, 15000);
				
			} catch (error) {
				if (this.settings.debugMode) {
					console.error('AI test failed:', error);
				}
				new Notice(`AI test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
			}
		})();
	}

}

// Confirmation Modal to replace confirm()
class ConfirmModal extends Modal {
	private title: string;
	private message: string;
	private onConfirm: () => void;

	constructor(app: App, title: string, message: string, onConfirm: () => void) {
		super(app);
		this.title = title;
		this.message = message;
		this.onConfirm = onConfirm;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: this.title });
		contentEl.createEl('p', { text: this.message });

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		
		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.onclick = () => this.close();

		const confirmButton = buttonContainer.createEl('button', { 
			text: 'Continue',
			cls: 'mod-cta'
		});
		confirmButton.onclick = () => {
			this.onConfirm();
			this.close();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}

