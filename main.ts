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

	async onload() {
		console.log('Loading SANE - Smart AI Note Evolution');

		// Add custom icon
		addIcon('sane-brain', BRAIN_ICON);

		// Load settings
		await this.loadSettings();

		// Show security warnings for first-time users
		if (!this.settings.privacyWarningShown || this.settings.requireBackupWarning) {
			this.showSecurityWarnings();
		}

		// Initialize AI provider
		this.aiProvider = new UnifiedAIProvider(this.settings);

		// Load existing embeddings
		await this.loadEmbeddings();

		// Register event handlers
		this.registerEventHandlers();

		// Add commands
		this.addCommands();

		// Add settings tab
		this.addSettingTab(new SANESettingTab(this.app, this));

		// Add ribbon icon
		this.addRibbonIcon('sane-brain', 'SANE: Process current note', async () => {
			await this.processCurrentNote();
		});

		// Schedule processing if enabled
		this.scheduleProcessing();

		new Notice('SANE - Smart AI Note Evolution loaded!');
	}

	async onunload() {
		console.log('Unloading SANE');
		
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
			this.saveSettings();
		});
		modal.open();
	}

	private registerEventHandlers(): void {
		// Note creation handler
		this.registerEvent(
			this.app.vault.on('create', async (file) => {
				if (file instanceof TFile && this.shouldProcessFile(file)) {
					await this.handleNoteChange(file);
				}
			})
		);

		// Note modification handler
		this.registerEvent(
			this.app.vault.on('modify', async (file) => {
				if (file instanceof TFile && this.shouldProcessFile(file)) {
					await this.handleNoteChange(file);
				}
			})
		);

		// Note deletion handler
		this.registerEvent(
			this.app.vault.on('delete', async (file) => {
				if (file instanceof TFile && file.extension === 'md') {
					this.noteEmbeddings.delete(file.path);
				}
			})
		);
	}

	private shouldProcessFile(file: any): boolean {
		if (!(file instanceof TFile) || file.extension !== 'md') {
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
		this.delayedProcessingTimer = setTimeout(async () => {
			await this.processQueuedNotes();
		}, this.settings.delayMinutes * 60 * 1000);
	}

	private scheduleProcessing(): void {
		// Clear existing timer
		if (this.scheduledProcessingTimer) {
			clearTimeout(this.scheduledProcessingTimer);
		}

		if (this.settings.processingTrigger === 'scheduled') {
			const now = new Date();
			const scheduled = new Date();
			scheduled.setHours(this.settings.scheduleHour, 0, 0, 0);
			
			// If scheduled time has passed today, schedule for tomorrow
			if (scheduled <= now) {
				scheduled.setDate(scheduled.getDate() + 1);
			}

			const timeUntilScheduled = scheduled.getTime() - now.getTime();
			
			this.scheduledProcessingTimer = setTimeout(async () => {
				await this.processQueuedNotes();
				this.scheduleProcessing(); // Reschedule for next day
			}, timeUntilScheduled);

			console.log(`SANE: Next scheduled processing at ${scheduled.toLocaleString()}`);
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
		if (!this.aiProvider.isConfigured()) {
			new Notice('AI provider not configured. Please check settings.');
			return;
		}

		try {
			console.log(`SANE: Processing note ${file.path}`);

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
			console.error(`SANE: Error processing note ${file.path}:`, error);
			
			// Check if it's a budget error
			if (error.message.includes('budget')) {
				new Notice('Daily budget reached. Processing paused until tomorrow.');
			} else {
				new Notice(`Error processing note: ${error.message}`);
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
		try {
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
			await this.applyEnhancement(file, content, enhancement);

		} catch (error) {
			console.error(`SANE: Error updating note ${file.path}:`, error);
			throw error;
		}
	}

	private async applyEnhancement(file: TFile, originalContent: string, enhancement: Enhancement): Promise<void> {
		// Parse existing frontmatter or create new
		let frontmatter: Record<string, any> = {};
		let contentWithoutFrontmatter = originalContent;

		const frontmatterMatch = originalContent.match(/^---\n([\s\S]*?)\n---\n?/);
		if (frontmatterMatch) {
			contentWithoutFrontmatter = originalContent.substring(frontmatterMatch[0].length);
			// Simple YAML parsing
			const lines = frontmatterMatch[1].split('\n');
			for (const line of lines) {
				const colonIndex = line.indexOf(':');
				if (colonIndex > 0) {
					const key = line.substring(0, colonIndex).trim();
					const value = line.substring(colonIndex + 1).trim();
					frontmatter[key] = this.parseYamlValue(value);
				}
			}
		}

		// Add/update SANE enhancements (ignore existing tags/links as per plan)
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
			frontmatter.created_at = creationDate.toISOString().toLocaleString();
		}
		if (this.settings.enableModificationTimestamp) {
			const modificationDate = new Date(file.stat.mtime);
			frontmatter.modified_at = modificationDate.toISOString().toLocaleString();
		}

		// Add metadata
		frontmatter.sane_updated = new Date().toISOString();
		frontmatter.sane_version = '1.0';

		// Generate new frontmatter
		const newFrontmatter = this.generateFrontmatter(frontmatter);

		// Combine with content
		const newContent = newFrontmatter + '\n\n' + contentWithoutFrontmatter;

		// Write back to file
		await this.app.vault.modify(file, newContent);
	}

	private parseYamlValue(value: string): any {
		if (value.startsWith('[') && value.endsWith(']')) {
			return value.slice(1, -1).split(',').map(item => item.trim().replace(/^["']|["']$/g, ''));
		}
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			return value.slice(1, -1);
		}
		if (value === 'true') return true;
		if (value === 'false') return false;
		if (!isNaN(Number(value))) return Number(value);
		return value;
	}

	private generateFrontmatter(frontmatter: Record<string, any>): string {
		const lines = ['---'];
		
		for (const [key, value] of Object.entries(frontmatter)) {
			if (value === undefined || value === null) continue;
			
			if (Array.isArray(value)) {
				if (value.length > 0) {
					lines.push(`${key}: [${value.map(v => `"${v}"`).join(', ')}]`);
				}
			} else if (typeof value === 'string') {
				lines.push(`${key}: "${value}"`);
			} else {
				lines.push(`${key}: ${value}`);
			}
		}
		
		lines.push('---');
		return lines.join('\n');
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
			callback: async () => {
				await this.processCurrentNote();
			}
		});

		this.addCommand({
			id: 'process-all-notes',
			name: 'Initialize: Process all notes in target folder',
			callback: async () => {
				await this.initializeAllNotes();
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
		if (this.settings.debugMode) {
			this.addCommand({
				id: 'test-ai-response',
				name: 'Test AI response (debug)',
				callback: async () => {
					await this.testAIResponse();
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

	public async initializeAllNotes(): Promise<void> {
		const confirmed = confirm(
			'This will process all notes in the target folder. This may take time and use API credits. Continue?'
		);

		if (!confirmed) return;

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
				console.error(`Error processing ${file.path}:`, error);
				if (error.message.includes('budget')) {
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
		if (!this.aiProvider.isConfigured()) {
			new Notice('AI provider not configured');
			return;
		}

		try {
			new Notice('Testing AI response format...');
			
			const testContent = "This is a test note about machine learning and artificial intelligence. It discusses neural networks and their applications in modern AI systems.";
			const testRelated = ["Introduction to AI: Basic concepts", "Neural Networks: Deep dive"];
			
			console.log('Testing AI response with:', { testContent, testRelated });
			
			const enhancement = await this.aiProvider.generateEnhancement(testContent, testRelated);
			
			console.log('AI enhancement result:', enhancement);
			
			const message = `🧪 AI Test Results:
Tags: ${enhancement.tags.join(', ')}
Keywords: ${enhancement.keywords.join(', ')}
Links: ${enhancement.links.join(', ')}
Summary: ${enhancement.summary}`;

			new Notice(message, 15000);
			
		} catch (error) {
			console.error('AI test failed:', error);
			new Notice(`AI test failed: ${error.message}`);
		}
	}

	// Persistence
	private async loadEmbeddings(): Promise<void> {
		try {
			const stored = localStorage.getItem('sane-embeddings');
			if (stored) {
				const data = JSON.parse(stored);
				this.noteEmbeddings = new Map(data);
			}
		} catch (error) {
			console.error('Error loading embeddings:', error);
		}
	}

	private async saveEmbeddings(): Promise<void> {
		try {
			const data = Array.from(this.noteEmbeddings.entries());
			localStorage.setItem('sane-embeddings', JSON.stringify(data));
		} catch (error) {
			console.error('Error saving embeddings:', error);
		}
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
		warning.innerHTML = `
			<h3>⚠️ Important Security Information</h3>
			<p><strong>Before using SANE (Beta), please:</strong></p>
			<ul>
				<li><strong>🔄 Backup your vault</strong> - SANE modifies your notes by adding YAML frontmatter</li>
				<li><strong>🔐 API Keys</strong> - Your API keys are stored locally and never shared</li>
				<li><strong>📤 Data Privacy</strong> - Your note content is sent to your chosen AI provider for processing</li>
				<li><strong>💰 Costs</strong> - AI processing incurs costs based on your provider's pricing</li>
				<li><strong>📁 Scope</strong> - Consider setting a target folder to limit which notes are processed</li>
			</ul>

			<h3>🛡️ Privacy Recommendations</h3>
			<ul>
				<li>Review your AI provider's data policies</li>
				<li>Consider using local models for sensitive content</li>
				<li>Set daily budget limits to control costs</li>
				<li>Test with a few notes before processing your entire vault</li>
			</ul>

			<p><strong>By continuing, you acknowledge these risks and confirm you have backed up your vault.</strong></p>
		`;

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