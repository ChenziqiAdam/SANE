# SANE - Smart AI Note Evolution (Beta)

![SANE](assets/SANE.png)

**Keep it Simple and Stupid** - An intelligent Obsidian plugin that evolves your notes automatically using AI. When you add or edit a note, SANE finds the 3 most relevant notes in your vault and enhances them with smart tags, keywords, links, and summaries.

## 🧠 How SANE Works

SANE follows a simple but powerful approach:

1. **📝 You add/edit a note** → SANE detects the change
2. **🔍 SANE finds the 3 most relevant notes** → Using AI embeddings for semantic similarity  
3. **✨ SANE enhances those 3 notes** → Adds tags, keywords, links, and summaries via YAML frontmatter
4. **🔄 Your knowledge evolves** → Notes become more connected and discoverable over time

### 🎯 Why This Approach?

- **KISS Principle**: Simple, predictable behavior that's easy to understand
- **Efficient**: Only processes 3 notes per change, saving time and API costs
- **Non-intrusive**: Adds YAML frontmatter at the beginning, preserving your original content
- **Evolving**: Your vault becomes smarter as you add more notes

## ✨ Features

### 🤖 **Multiple AI Providers**
- **OpenAI** (gpt-4o-mini)
- **Google AI** (gemini-2.0-flash)
- **Grok** (grok-3-latest)
- **Azure OpenAI**
- **Local LLMs** (Ollama support)

### ⚙️ **Smart Processing**
- **Configurable Triggers**: Immediate, delayed (10 mins after editing), scheduled daily, or manual
- **Targeted Scope**: Process only specific folders to maintain control
- **Simple Embeddings**: Full note embeddings for better context understanding
- **Cost Control**: Daily budget limits and real-time cost tracking

### 🛡️ **Security First**
- **Privacy Warnings**: Clear notices about data usage
- **Backup Reminders**: Prompts to backup your vault before first use
- **Folder Restrictions**: Limit processing to specific folders
- **Local Options**: Support for local LLMs to keep data private

### 💰 **Cost Management**
- **Daily Budgets**: Set spending limits to prevent surprises
- **Real-time Tracking**: Monitor usage and costs
- **Provider Comparison**: See estimated costs for each AI provider
- **Free Option**: Use local LLMs for zero-cost processing

## 🚀 Quick Start

### 1. Install SANE
- Download from Obsidian Community Plugins (coming soon)
- Or manually install from GitHub releases

### 2. Configure Your AI Provider
- Choose from OpenAI, Google AI, Grok, Azure, or Local
- Add your API key in settings
- Set a daily budget (recommended: $1-2 for most users)

### 3. Set Your Scope (Recommended)
- Create a specific folder like "Knowledge Base" or "Smart Notes"
- Set this as your target folder in SANE settings
- Only notes in this folder will be processed

### 4. Initialize Your Vault
- Run "Initialize: Process all notes in target folder" 
- SANE will process all existing notes, treating each as new
- This builds the initial knowledge graph

### 5. Start Writing!
- Add or edit notes in your target folder
- SANE automatically finds and enhances the 3 most relevant notes
- Watch your knowledge evolve!

## 📋 Example Output

When SANE processes a note, it adds YAML frontmatter like this:

```yaml
---
sane_tags: ["machine-learning", "neural-networks", "ai"]
sane_keywords: ["deep learning", "backpropagation", "training data"]
sane_links: ["Introduction to AI", "Neural Network Basics"]
sane_summary: "Comprehensive guide to understanding neural networks and their applications in modern AI systems."
sane_version: "1.0"
created_at: "2025/5/5 19:59:11"
modified_at: "2025/6/29 12:15:12"
---

# Your Original Content
Your original note content remains completely unchanged...
```

## 💸 Cost Examples

**Small vault (100 notes)**:
- OpenAI: ~$0.15 total
- Google AI: ~$0.05 total  
- Local: Free

**Medium vault (1,000 notes)**:
- OpenAI: ~$1.50 total
- Google AI: ~$0.50 total
- Local: Free

**Large vault (10,000 notes)**:
- OpenAI: ~$15 total  
- Google AI: ~$5 total
- Local: Free

*Costs are one-time for initial processing. Daily usage is typically $0.01-0.10 depending on how much you write.*

## 🔧 Settings Overview

### AI Provider Options
- **OpenAI**: Most capable, moderate cost
- **Google AI**: Good quality, lowest cost  
- **Grok**: X.AI's latest model, experimental
- **Azure**: Enterprise OpenAI with your own deployment
- **Local**: Ollama support, completely free and private

### Processing Triggers
- **Immediate**: Process as soon as you edit (for instant feedback)
- **Delayed**: Wait 10 minutes after editing stops (recommended)
- **Scheduled**: Process once daily at 2 AM (for batch efficiency)
- **Manual**: Only process when you command it

### Security & Scope
- **Target Folder**: Limit processing to specific folder
- **Privacy Warnings**: Clear disclosure about AI provider data usage
- **Backup Reminders**: Ensure you backup before first use

## 🛡️ Privacy & Security

### What SANE Does
- ✅ Stores API keys locally in Obsidian
- ✅ Processes only notes in your target folder
- ✅ Adds YAML frontmatter without changing your content
- ✅ Provides local LLM option for complete privacy

### What SANE Sends to AI Providers
- 📤 Your note content (for AI processing)
- 📤 Content from related notes (for context)
- ❌ Never your API keys or personal data

### Recommendations
- 🔄 **Backup your vault first** (SANE modifies files)
- 📁 **Use a specific folder** to limit scope  
- 🏠 **Consider local LLMs** for sensitive content
- 💰 **Set daily budgets** to control costs

## 🏠 Local LLM Setup

For complete privacy and zero costs:

1. **Install Ollama**: Download from [ollama.ai](https://ollama.ai)
2. **Download Models**:
   ```bash
   ollama pull llama2          # For text generation
   ollama pull nomic-embed-text # For embeddings
   ```
3. **Start Ollama**: `ollama serve`
4. **Configure SANE**: Set provider to "Local" and endpoint to `http://localhost:11434`

## 🆘 Support & Development

### ❤️ Love SANE?
- ⭐ [Star us on GitHub](https://github.com/Ghost04718/SANE)
- ☕ [Buy us a coffee](https://buymeacoffee.com/adamchen)  
- 🐛 [Report bugs](https://github.com/Ghost04718/SANE/issues)
- 💡 [Suggest features](https://github.com/Ghost04718/SANE/discussions)

### 🧪 Help Test & Develop
- **Test Local LLMs**: Help us improve Ollama integration
- **Develop**: Contribute code, documentation, or translations
- **Community**: Share your SANE workflows and tips

## ❓ FAQ

**Q: Will SANE change my existing notes?**
A: SANE only adds YAML frontmatter to the beginning of notes. Your original content is never modified.

**Q: What if I don't like the AI suggestions?**
A: Simply delete the SANE-generated YAML frontmatter. SANE prefixes all fields with `sane_` so they're easy to identify and remove.

**Q: How much does it cost?**
A: Very little! Most users spend $0.01-0.10 per day. You can set daily budgets to control costs, and local LLMs are completely free.

**Q: Is my data private?**
A: Your notes are sent to your chosen AI provider for processing. For complete privacy, use the local LLM option with Ollama.

**Q: What if the AI returns malformed responses?**
A: SANE includes robust response parsing that handles JSON wrapped in markdown code blocks, malformed JSON, and provides regex-based fallback extraction. If all else fails, it gracefully returns empty results rather than crashing.

**Q: How can I test if my AI provider is working?**
A: Use the "Test AI Connection" button in settings or run the "Test AI provider connection" command. This will show you exactly what the AI returns and help debug any issues.

**Q: What happens if I have a large vault?**
A: Set a target folder to limit processing scope. SANE is designed to handle vaults of any size efficiently.

## 📄 License

MIT License - Feel free to modify and distribute!

---

**SANE - Smart AI Note Evolution**: Because your notes should evolve as smartly as your thinking does. 🧠✨