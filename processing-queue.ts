import { TFile } from 'obsidian';
import { SANESettings, QueueStatus } from './types';

export class ProcessingQueue {
	private queue: TFile[] = [];
	private inFlight: string | null = null;
	private stopped = false;
	private delayedTimer?: number;
	private scheduledTimer?: number;
	private statusListeners: Array<(status: QueueStatus) => void> = [];

	constructor(
		private processNote: (file: TFile) => Promise<void>,
		private settings: SANESettings
	) {}

	updateSettings(settings: SANESettings): void {
		this.settings = settings;
		this.reschedule();
	}

	enqueue(file: TFile): void {
		if (this.stopped) return;
		if (this.inFlight === file.path) return;
		if (this.queue.some(f => f.path === file.path)) return;

		this.queue.push(file);
		this.emitStatus();

		switch (this.settings.processingTrigger) {
			case 'immediate':
				void this.tick();
				break;
			case 'delayed':
				this.scheduleDelayed();
				break;
			case 'scheduled':
			case 'manual':
				break;
		}
	}

	async runAll(): Promise<void> {
		while (this.queue.length > 0 && !this.stopped) {
			await this.tick();
		}
	}

	async drain(): Promise<void> {
		this.stopped = true;
		this.clearTimers();
		while (this.inFlight !== null) {
			await new Promise(resolve => activeWindow.setTimeout(resolve, 50));
		}
	}

	get size(): number {
		return this.queue.length;
	}

	get isProcessing(): boolean {
		return this.inFlight !== null;
	}

	onStatusChange(cb: (status: QueueStatus) => void): void {
		this.statusListeners.push(cb);
	}

	scheduleDaily(): void {
		this.clearScheduledTimer();
		if (this.settings.processingTrigger !== 'scheduled') return;

		const now = new Date();
		const next = new Date();
		next.setHours(this.settings.scheduleHour, 0, 0, 0);
		if (next <= now) next.setDate(next.getDate() + 1);

		const delay = next.getTime() - now.getTime();
		this.scheduledTimer = activeWindow.setTimeout(() => {
			void this.runAll();
			this.scheduleDaily();
		}, delay);
	}

	private async tick(): Promise<void> {
		if (this.inFlight !== null || this.queue.length === 0 || this.stopped) return;

		const file = this.queue.shift()!;
		this.inFlight = file.path;
		this.emitStatus();

		try {
			await this.processNote(file);
		} catch (e) {
			const msg = e instanceof Error ? e.message : 'Unknown error';
			this.emitStatus({ type: 'error', message: msg });
		} finally {
			this.inFlight = null;
			this.emitStatus();
			if (!this.stopped && this.settings.processingTrigger === 'immediate') {
				void this.tick();
			}
		}
	}

	private scheduleDelayed(): void {
		if (this.delayedTimer) activeWindow.clearTimeout(this.delayedTimer);
		this.delayedTimer = activeWindow.setTimeout(() => {
			void this.runAll();
		}, this.settings.delayMinutes * 60 * 1000);
	}

	private reschedule(): void {
		this.clearTimers();
		if (this.settings.processingTrigger === 'scheduled') {
			this.scheduleDaily();
		}
	}

	private clearTimers(): void {
		this.clearDelayedTimer();
		this.clearScheduledTimer();
	}

	private clearDelayedTimer(): void {
		if (this.delayedTimer) {
			activeWindow.clearTimeout(this.delayedTimer);
			this.delayedTimer = undefined;
		}
	}

	private clearScheduledTimer(): void {
		if (this.scheduledTimer) {
			activeWindow.clearTimeout(this.scheduledTimer);
			this.scheduledTimer = undefined;
		}
	}

	private emitStatus(override?: QueueStatus): void {
		const status: QueueStatus = override ?? (
			this.inFlight !== null
				? { type: 'processing', file: this.inFlight, queued: this.queue.length }
				: { type: 'idle' }
		);
		for (const listener of this.statusListeners) {
			listener(status);
		}
	}
}
