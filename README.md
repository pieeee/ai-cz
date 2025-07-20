# AI-CZ 🤖

AI-powered conventional commit tool with emojis that analyzes your git changes and suggests meaningful commit messages.

## Features

- 🧠 AI-powered commit message suggestions using OpenAI
- 📝 Conventional commit format with emojis
- 🔒 Secure local token storage with encryption
- 🎯 Smart scope and type suggestions based on your changes
- 🚀 Simple CLI interface

## Installation

```bash
npm install -g @pieeee/ai-cz
```

## Usage

### Generate a commit (default)
```bash
ai-cz
```

### Manage OpenAI API token
```bash
ai-cz --token
```

### Get help
```bash
ai-cz --help
```

## Setup

1. Get your OpenAI API key from [OpenAI Platform](https://platform.openai.com/api-keys)
2. Run `ai-cz --token` to set up your API key
3. Start using `ai-cz` in any git repository!

## How it works

1. Analyzes your staged/unstaged git changes
2. Sends the diff to OpenAI for analysis
3. Suggests appropriate commit types, scopes, and messages
4. Lets you select or customize the suggestions
5. Creates a beautiful conventional commit with emojis

## Example output

```
feat(auth): ✨ implement OAuth2 login flow
fix(api): 🐛 resolve user data validation error
docs(readme): 📚 add installation instructions
```

## Requirements

- Node.js 18+
- Git repository
- OpenAI API key

## License

MIT