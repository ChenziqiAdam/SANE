# SANE — Smart AI Note Evolution

> [Official Website](https://chenziqiadam.github.io/SANE/) | [Full Documentation](https://chenziqiadam.github.io/SANE/docs/index.html)

An Obsidian plugin that automatically enhances your notes using AI. When you add or edit a note, SANE finds the most relevant notes in your vault and enriches them with tags, keywords, links, and summaries via YAML frontmatter.

## Features

- **Multiple AI providers** — OpenAI, Google AI, Grok, Azure OpenAI, and local LLMs (Ollama)
- **Semantic similarity** — finds related notes using embeddings, not keyword matching
- **Flexible triggers** — process immediately, after a delay, on a schedule, or manually
- **Targeted scope** — limit processing to a specific folder
- **Cost controls** — daily budget limits and real-time cost tracking
- **Reversible** — all generated fields are prefixed with `sane_` and can be removed at any time

## Quick Start

1. **Install** — search for "SANE" in Obsidian Community Plugins (or install manually from GitHub releases)
2. **Configure** — choose an AI provider and add your API key in Settings > SANE
3. **Set scope** — specify a target folder to limit which notes are processed (recommended)
4. **Initialize** — run "Initialize all notes" to process your existing notes
5. **Write** — SANE processes notes automatically as you add or edit them

## Example Output

SANE adds frontmatter to the top of processed notes:

```yaml
sane_tags: ["machine-learning", "neural-networks"]
sane_keywords: ["backpropagation", "training data"]
sane_links: ["Introduction to AI", "Neural Network Basics"]
sane_summary: "A guide to understanding neural networks and their applications."
sane_version: "1.0"
created_at: "2025/5/5 19:59:11"
modified_at: "2025/6/29 12:15:12"
```

Your original note content is never modified.

## Documentation

Full usage documentation, configuration reference, and local LLM setup guide are available at the project documentation site.

## Support

- [GitHub repository](https://github.com/Ghost04718/SANE)
- [Report a bug](https://github.com/Ghost04718/SANE/issues)
- [Suggest a feature](https://github.com/Ghost04718/SANE/discussions)
- [Buy me a coffee](https://buymeacoffee.com/adamchen)

## License

MIT