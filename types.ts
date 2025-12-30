import { TFile } from 'obsidian';

export interface SANESettings {
	// AI Provider
	aiProvider: 'openai' | 'google' | 'grok' | 'azure' | 'local';
	openaiApiKey: string;
	googleApiKey: string;
	grokApiKey: string;
	azureApiKey: string;
	azureEndpoint: string;
	localEndpoint: string;
	
	// Models
	llmModel: string;
	embeddingModel: string;
	
	// Processing Settings
	relevantNotesCount: number; // Default: 3
	processingTrigger: 'immediate' | 'delayed' | 'scheduled' | 'manual';
	delayMinutes: number; // Default: 10
	scheduleHour: number; // Default: 2 (2 AM)
	
	// Security & Scope
	targetFolder: string; // Only process files in this folder
	requireBackupWarning: boolean;
	privacyWarningShown: boolean;
	
	// Cost Management
	dailyBudget: number;
	costTracking: boolean;
	
	// Feature Toggles
	enableTags: boolean;
	enableKeywords: boolean;
	enableLinks: boolean;
	enableSummary: boolean;
	enableCreationTimestamp: boolean;
	enableModificationTimestamp: boolean;
	
	// Advanced
	maxTokens: number;
	temperature: number;
	debugMode: boolean;
}

export const DEFAULT_SETTINGS: SANESettings = {
	aiProvider: 'openai',
	openaiApiKey: '',
	googleApiKey: '',
	grokApiKey: '',
	azureApiKey: '',
	azureEndpoint: '',
	localEndpoint: 'http://localhost:11434',
	
	llmModel: 'gpt-4o-mini',
	embeddingModel: 'text-embedding-3-small',
	
	relevantNotesCount: 3,
	processingTrigger: 'delayed',
	delayMinutes: 10,
	scheduleHour: 2,
	
	targetFolder: '', // Empty means all folders
	requireBackupWarning: true,
	privacyWarningShown: false,
	
	dailyBudget: 1.0,
	costTracking: true,
	
	enableTags: true,
	enableKeywords: true,
	enableLinks: true,
	enableSummary: true,
	enableCreationTimestamp: true,
	enableModificationTimestamp: true,
	
	maxTokens: 2000,
	temperature: 0.3,
	debugMode: false
};

export interface NoteEmbedding {
	path: string;
	content: string;
	embedding: number[];
	lastUpdated: number;
}

export interface RelevantNote {
	file: TFile;
	similarity: number;
}

export interface Enhancement {
	tags: string[];
	keywords: string[];
	links: string[];
	summary: string;
}

export interface CostEntry {
	timestamp: number;
	operation: string;
	cost: number;
	provider: string;
}

export interface AIProvider {
	generateEnhancement(content: string, relatedContent: string[]): Promise<Enhancement>;
	generateEmbedding(content: string): Promise<number[]>;
	estimateCost(tokens: number): number;
}