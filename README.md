# SmartMouse - AI-Powered Mouse Control

**SmartMouse** is an intelligent mouse control system that uses computer vision and AI to automate mouse interactions. It can detect objects on screen and intelligently click, drag, or interact with them.

## Features

- 🖱️ **AI-Powered Mouse Control** - Uses computer vision to detect and interact with UI elements
- 👁️ **Object Detection** - Powered by OWL-ViT and DETR models for accurate object recognition
- 🧠 **Smart Planning** - AI planner determines the best actions to achieve goals
- 🔄 **Action Automation** - Automates clicks, drags, typing, and keyboard shortcuts
- 📊 **Visual Feedback** - Shows detection results and action plans

## Installation

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/smartmouse-ts.git
cd smartmouse-ts

# Install dependencies
npm install

# Copy and configure your API key
cp config.json.example config.json
# Edit config.json and add your API key

# Build and run
npm run build
npm start
```

## Configuration

Copy `config.json.example` to `config.json` and configure:

```json
{
  "api_key": "YOUR_API_KEY_HERE",  // Your AI API key
  "api_base_url": "https://your-api-provider.com/v1",
  "model": "qwen3.5-plus",
  ...
}
```

**⚠️ IMPORTANT: Never commit your `config.json` file with real API keys!**

## Architecture

```
SmartMouse Architecture:
┌─────────────────────────────────────────────────────────────┐
│  Brain.ts - Main AI Agent                                   │
│    → Receives goals from user                               │
│    → Plans actions using AI                                 │
│    → Executes mouse/keyboard actions                        │
├─────────────────────────────────────────────────────────────┤
│  Actions.ts - Action Execution                              │
│    → Click, Double-click, Drag                              │
│    → Type text, Keyboard shortcuts                          │
│    → Scroll, Wait, Screenshot                               │
├─────────────────────────────────────────────────────────────┤
│  Vision Models (Xenova/Transformers.js)                     │
│    → OWL-ViT: Object detection with text prompts            │
│    → DETR: General object detection                         │
│    → ViT-GPT2: Image captioning                             │
└─────────────────────────────────────────────────────────────┘
```

## Usage

```typescript
// Example: Click a button by describing it
await smartMouse.executeGoal("Click the 'Submit' button");

// Example: Type text in a field
await smartMouse.executeGoal("Type 'Hello World' in the search box");

// Example: Complex action chain
await smartMouse.executeGoal("Find the login button, click it, then enter username 'admin'");
```

## Models

This project uses transformers.js for local AI models:

- **OWL-ViT** (`owlvit-base-patch32`, `owlv2-base-patch16-ensemble`) - Text-prompted object detection
- **DETR** (`detr-resnet-50`) - General object detection
- **ViT-GPT2** (`vit-gpt2-image-captioning`) - Image captioning

Models are downloaded automatically on first run.

## Security

- **Never share your API keys**
- **config.json is excluded from git** via `.gitignore`
- **Use environment variables** for production deployments

## Contributing

We welcome contributions! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

**AI Contributors Welcome!** This project is designed for AI-assisted development. AI agents can:
- Review code and suggest improvements
- Fix bugs and add features
- Write tests and documentation
- Optimize performance

## License

MIT License - See LICENSE file for details.

## Acknowledgments

- [Transformers.js](https://huggingface.co/docs/transformers.js) - Local AI models in JavaScript
- [OWL-ViT](https://huggingface.co/google/owlvit-base-patch32) - Open-world object detection
- Qwen AI models for planning and decision-making

---

**Made with 🖱️ + 🧠 by SmartMouse Team**