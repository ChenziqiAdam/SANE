import { Notice, Plugin, TFile, addIcon, Modal, App } from 'obsidian';
import { SANESettings, DEFAULT_SETTINGS, NoteEmbedding, RelevantNote, Enhancement, CostEntry } from './types';
import { SANESettingTab } from './settings-tab';
import { UnifiedAIProvider } from './ai-service';

// Simple brain icon for the plugin
const BRAIN_ICON = `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M12 3C8.13 3 5 6.13 5 10c0 1.74.63 3.34 1.68 4.58L12 21l5.32-6.42C18.37 13.34 19 11.74 19 10c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z" fill="currentColor"/>
</svg>`;

export default class SANEPlugin extends Plugin {
	settings: SANESettings;
	aiProvider: UnifiedAIProvider;
	
	// Simple in-memory storage for embeddings
	private noteEmbeddings: Map<string, NoteEmbedding> = new Map();
	private processingQueue: Set<string> = new Set();
	private delayedProcessingTimer?: NodeJS.Timeout;
	private scheduledProcessingTimer?: NodeJS.Timeout;
	private costEntries: CostEntry[] = [];

	onload(): void {
		this.loadSettings().then(() => {
			if (this.settings?.debugMode) {
				console.debug('Loading SANE - Smart AI Note Evolution');
			}

			// Add custom icon
			addIcon('sane-brain', BRAIN_ICON);

			// Show security warnings for first-time users
			if (!this.settings.privacyWarningShown || this.settings.requireBackupWarning) {
				this.showSecurityWarnings();
			}

			// Initialize AI provider
			this.aiProvider = new UnifiedAIProvider(this.settings);

			// Load existing embeddings
			void this.loadEmbeddings();

			// Register event handlers
			this.registerEventHandlers();

			// Add commands
			this.addCommands();

			// Add settings tab
			this.addSettingTab(new SANESettingTab(this.app, this));

			// Add ribbon icon
			this.addRibbonIcon('sane-brain', 'SANE: Process current note', () => {
				void this.processCurrentNote();
			});

			// Schedule processing if enabled
			this.scheduleProcessing();

			new Notice('SANE - Smart AI Note Evolution loaded!');
		}).catch((error) => {
			console.error('Failed to load SANE plugin:', error);
			new Notice('Failed to load SANE plugin. Please check console for details.');
		});
	}

	async onunload(): Promise<void> {
		if (this.settings?.debugMode) {
			console.debug('Unloading SANE');
		}
		
		// Clear timers
		if (this.delayedProcessingTimer) {
			clearTimeout(this.delayedProcessingTimer);
		}
		if (this.scheduledProcessingTimer) {
			clearTimeout(this.scheduledProcessingTimer);
		}

		// Save embeddings
		await this.saveEmbeddings();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
		
		// Update AI provider with new settings
		if (this.aiProvider) {
			this.aiProvider.updateSettings(this.settings);
		}

		// Reschedule processing if needed
		this.scheduleProcessing();
	}

	private showSecurityWarnings(): void {
		const modal = new SecurityWarningModal(this.app, () => {
			this.settings.privacyWarningShown = true;
			this.settings.requireBackupWarning = false;
			void this.saveSettings();
		});
		modal.open();
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
		// Add to processing queue
		this.processingQueue.add(file.path);

		// Handle based on processing trigger
		switch (this.settings.processingTrigger) {
			case 'immediate':
				await this.processNote(file);
				break;
			case 'delayed':
				this.scheduleDelayedProcessing();
				break;
			case 'scheduled':
				// Will be handled by scheduled timer
				break;
			case 'manual':
				// Only process manually
				break;
		}
	}

	private scheduleDelayedProcessing(): void {
		// Clear existing timer
		if (this.delayedProcessingTimer) {
			clearTimeout(this.delayedProcessingTimer);
		}

		// Set new timer
		this.delayedProcessingTimer = setTimeout(() => {
			void this.processQueuedNotes();
		}, this.settings.delayMinutes * 60 * 1000);
	}

	private scheduleProcessing(): void {
		// Clear existing timer
		if (this.scheduledProcessingTimer) {
			clearTimeout(this.scheduledProcessingTimer);
		}

		if (this.settings?.processingTrigger === 'scheduled') {
			const now = new Date();
			const scheduled = new Date();
			scheduled.setHours(this.settings.scheduleHour, 0, 0, 0);
			
			// If scheduled time has passed today, schedule for tomorrow
			if (scheduled <= now) {
				scheduled.setDate(scheduled.getDate() + 1);
			}

			const timeUntilScheduled = scheduled.getTime() - now.getTime();
			
			this.scheduledProcessingTimer = setTimeout(() => {
				void this.processQueuedNotes();
				this.scheduleProcessing(); // Reschedule for next day
			}, timeUntilScheduled);

			// Debug logging only in debug mode
			if (this.settings?.debugMode) {
				console.debug(`SANE: Next scheduled processing at ${scheduled.toLocaleString()}`);
			}
		}
	}

	private async processQueuedNotes(): Promise<void> {
		if (this.processingQueue.size === 0) return;

		const filesToProcess = Array.from(this.processingQueue);
		this.processingQueue.clear();

		for (const filePath of filesToProcess) {
			const file = this.app.vault.getAbstractFileByPath(filePath);
			if (file instanceof TFile) {
				await this.processNote(file);
			}
		}
	}

	private async processNote(file: TFile): Promise<void> {
		if (!this.aiProvider?.isConfigured()) {
			new Notice('AI provider not configured. Please check settings.');
			return;
		}

		// Debug logging only in debug mode
		if (this.settings?.debugMode) {
			console.debug(`SANE: Processing note ${file.path}`);
		}

		try {
			// Read note content
			const content = await this.app.vault.read(file);
			const cleanContent = this.cleanContent(content);

			// Generate embedding for this note
			const embedding = await this.aiProvider.generateEmbedding(cleanContent);
			if (embedding.length === 0) return;

			// Store embedding
			this.noteEmbeddings.set(file.path, {
				path: file.path,
				content: cleanContent,
				embedding,
				lastUpdated: Date.now()
			});

			// Find most relevant notes (excluding current note)
			const relevantNotes = this.findRelevantNotes(file.path, this.settings.relevantNotesCount);

			// Update each relevant note
			for (const relevantNote of relevantNotes) {
				await this.updateNoteWithAI(relevantNote.file, [cleanContent]);
			}

			// If this is initialization, also update the current note
			if (this.isInitialization()) {
				await this.updateNoteWithAI(file, relevantNotes.map(r => r.file.path));
			}

		} catch (error) {
			// Check if it's a budget error
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
		await this.app.fileManager.processFrontMatter(file, (frontmatter) => {
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

	private isInitialization(): boolean {
		// Simple heuristic: if we have very few embeddings, we're likely initializing
		return this.noteEmbeddings.size < 10;
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
			name: 'Initialize: process all notes in target folder',
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
		new Notice('Current note processed!');
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
				await new Promise(resolve => setTimeout(resolve, 100));

			} catch (error) {
				if (this.settings?.debugMode) {
					console.error(`Error processing ${file.path}:`, error);
				}
				if (error instanceof Error && error.message.includes('budget')) {
					new Notice('Daily budget reached. Initialization paused.');
					break;
				}
			}
		}

		new Notice('Initialization complete!');
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

		const message = `💰 SANE Cost Summary:

📅 Today: ${todayCosts.toFixed(4)} / ${this.settings.dailyBudget}
📆 This Month: ${monthlyCosts.toFixed(4)}
🔄 Total API Calls: ${this.costEntries.length}
🧠 Notes with Embeddings: ${this.noteEmbeddings.size}

Provider: ${this.settings.aiProvider}`;

		new Notice(message, 10000);
	}

	private async testAIResponse(): Promise<void> {
		if (!this.aiProvider?.isConfigured()) {
			new Notice('AI provider not configured');
			return;
		}

		try {
			new Notice('Testing AI response format...');
			
			const testContent = "This is a test note about machine learning and artificial intelligence. It discusses neural networks and their applications in modern AI systems.";
			const testRelated = ["Introduction to AI: Basic concepts", "Neural Networks: Deep dive"];
			
			if (this.settings?.debugMode) {
				console.debug('Testing AI response with:', { testContent, testRelated });
			}
			
			const enhancement = await this.aiProvider.generateEnhancement(testContent, testRelated);
			
			if (this.settings?.debugMode) {
				console.debug('AI enhancement result:', enhancement);
			}
			
			const message = `🧪 AI test results:
Tags: ${enhancement.tags.join(', ')}
Keywords: ${enhancement.keywords.join(', ')}
Links: ${enhancement.links.join(', ')}
Summary: ${enhancement.summary}`;

			new Notice(message, 15000);
			
		} catch (error) {
			if (this.settings?.debugMode) {
				console.error('AI test failed:', error);
			}
			new Notice(`AI test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
		}
	}

	// Persistence
	private async loadEmbeddings(): Promise<void> {
		try {
			const stored = await this.app.loadLocalStorage('sane-embeddings');
			if (stored) {
				const data = JSON.parse(stored);
				this.noteEmbeddings = new Map(data);
			}
		} catch (error) {
			if (this.settings?.debugMode) {
				console.error('Error loading embeddings:', error);
			}
		}
	}

	private async saveEmbeddings(): Promise<void> {
		try {
			const data = Array.from(this.noteEmbeddings.entries());
			await this.app.saveLocalStorage('sane-embeddings', JSON.stringify(data));
		} catch (error) {
			if (this.settings?.debugMode) {
				console.error('Error saving embeddings:', error);
			}
		}
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

// Security Warning Modal
class SecurityWarningModal extends Modal {
	private onAccept: () => void;

	constructor(app: App, onAccept: () => void) {
		super(app);
		this.onAccept = onAccept;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl('h2', { text: '🔒 SANE Security & Privacy Notice' });

		const warning = contentEl.createDiv();
		
		warning.createEl('h3', { text: '⚠️ Important Security Information' });
		const beforeText = warning.createEl('p');
		beforeText.createEl('strong', { text: 'Before using SANE, please:' });
		
		const beforeList = warning.createEl('ul');
		
		const backupLi = beforeList.createEl('li');
		backupLi.createEl('strong', { text: '🔄 Backup your vault' });
		backupLi.appendText(' - SANE modifies your notes by adding YAML frontmatter');
		
		const apiLi = beforeList.createEl('li');
		apiLi.createEl('strong', { text: '🔐 API Keys' });
		apiLi.appendText(' - Your API keys are stored locally and never shared');
		
		const privacyLi = beforeList.createEl('li');
		privacyLi.createEl('strong', { text: '📤 Data Privacy' });
		privacyLi.appendText(' - Your note content is sent to your chosen AI provider for processing');
		
		const costsLi = beforeList.createEl('li');
		costsLi.createEl('strong', { text: '💰 Costs' });
		costsLi.appendText(' - AI processing incurs costs based on your provider\'s pricing');
		
		const scopeLi = beforeList.createEl('li');
		scopeLi.createEl('strong', { text: '📁 Scope' });
		scopeLi.appendText(' - Consider setting a target folder to limit which notes are processed');

		warning.createEl('h3', { text: '🛡️ Privacy Recommendations' });
		const privacyList = warning.createEl('ul');
		privacyList.createEl('li', { text: 'Review your AI provider\'s data policies' });
		privacyList.createEl('li', { text: 'Consider using local models for sensitive content' });
		privacyList.createEl('li', { text: 'Set daily budget limits to control costs' });
		privacyList.createEl('li', { text: 'Test with a few notes before processing your entire vault' });

		const acknowledgment = warning.createEl('p');
		acknowledgment.createEl('strong', { text: 'By continuing, you acknowledge these risks and confirm you have backed up your vault.' });

		const buttonContainer = contentEl.createDiv({ cls: 'modal-button-container' });
		
		const cancelButton = buttonContainer.createEl('button', { text: 'Cancel' });
		cancelButton.onclick = () => this.close();

		const acceptButton = buttonContainer.createEl('button', { 
			text: 'I Understand - Continue',
			cls: 'mod-cta'
		});
		acceptButton.onclick = () => {
			this.onAccept();
			this.close();
		};
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}