#!/usr/bin/env bun
import { execSync } from "child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
} from "fs";
import { homedir } from "os";
import { join } from "path";
import chalk from "chalk";
import inquirer from "inquirer";
import OpenAI from "openai";
import {
  createHash,
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from "crypto";

// Type declaration for Bun's import.meta.main
declare global {
  interface ImportMeta {
    main?: boolean;
  }
}

// Types
interface CommitType {
  type: string;
  description: string;
  emoji: string;
}

interface TokenManager {
  getToken(): string | null;
  setToken(token: string): void;
  hasToken(): boolean;
  clearToken(): void;
}

// Configuration
const COMMIT_TYPES: CommitType[] = [
  { type: "feat", description: "A new feature", emoji: "✨" },
  { type: "fix", description: "A bug fix", emoji: "🐛" },
  { type: "docs", description: "Documentation only changes", emoji: "📚" },
  {
    type: "style",
    description: "Changes that do not affect the meaning of the code",
    emoji: "💎",
  },
  {
    type: "refactor",
    description: "A code change that neither fixes a bug nor adds a feature",
    emoji: "♻️",
  },
  {
    type: "perf",
    description: "A code change that improves performance",
    emoji: "⚡",
  },
  {
    type: "test",
    description: "Adding missing tests or correcting existing tests",
    emoji: "🧪",
  },
  {
    type: "build",
    description:
      "Changes that affect the build system or external dependencies",
    emoji: "🏗️",
  },
  {
    type: "ci",
    description: "Changes to CI configuration files and scripts",
    emoji: "👷",
  },
  {
    type: "chore",
    description: "Other changes that don't modify src or test files",
    emoji: "🔧",
  },
  { type: "revert", description: "Reverts a previous commit", emoji: "⏪" },
];

class EncryptedTokenManager implements TokenManager {
  private readonly configDir: string;
  private readonly tokenFile: string;
  private readonly encryptionKey: string;

  constructor() {
    this.configDir = join(homedir(), ".ai-cz");
    this.tokenFile = join(this.configDir, "token.enc");
    // Use a combination of machine-specific data for encryption key
    this.encryptionKey = this.generateEncryptionKey();
  }

  private generateEncryptionKey(): string {
    const machineId = process.platform + process.arch + homedir();
    return createHash("sha256").update(machineId).digest("hex");
  }

  private ensureConfigDir(): void {
    if (!existsSync(this.configDir)) {
      mkdirSync(this.configDir, { recursive: true });
    }
  }

  private encrypt(text: string): string {
    const iv = randomBytes(16);
    // Use the full 64-character hex string, which represents 32 bytes when converted
    const key = Buffer.from(this.encryptionKey, "hex");
    const cipher = createCipheriv("aes-256-cbc", key, iv);
    let encrypted = cipher.update(text, "utf8", "hex");
    encrypted += cipher.final("hex");
    return iv.toString("hex") + ":" + encrypted;
  }

  private decrypt(encryptedText: string): string {
    const parts = encryptedText.split(":");
    if (parts.length !== 2) {
      throw new Error("Invalid encrypted data format");
    }
    const iv = Buffer.from(parts[0]!, "hex");
    const encrypted = parts[1]!;
    // Use the full 64-character hex string, which represents 32 bytes when converted
    const key = Buffer.from(this.encryptionKey, "hex");
    const decipher = createDecipheriv("aes-256-cbc", key, iv);
    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  }

  getToken(): string | null {
    try {
      if (!existsSync(this.tokenFile)) {
        return null;
      }

      const encryptedData = readFileSync(this.tokenFile, "utf8");
      const token = this.decrypt(encryptedData);

      return token || null;
    } catch (error) {
      console.error(chalk.red("❌ Failed to read stored token:"), error);
      return null;
    }
  }

  setToken(token: string): void {
    try {
      this.ensureConfigDir();
      const encrypted = this.encrypt(token);
      writeFileSync(this.tokenFile, encrypted);
      console.log(chalk.green("✅ API token saved securely"));
    } catch (error) {
      console.error(chalk.red("❌ Failed to save token:"), error);
      throw error;
    }
  }

  hasToken(): boolean {
    return this.getToken() !== null;
  }

  clearToken(): void {
    try {
      if (existsSync(this.tokenFile)) {
        unlinkSync(this.tokenFile);
        console.log(chalk.green("✅ API token cleared"));
      }
    } catch (error) {
      console.error(chalk.red("❌ Failed to clear token:"), error);
    }
  }
}

class AICommitGenerator {
  private openai!: OpenAI;
  private tokenManager: TokenManager;

  constructor() {
    this.tokenManager = new EncryptedTokenManager();
  }

  private async getOrRequestToken(): Promise<string> {
    // First try to get stored token
    let token = this.tokenManager.getToken();

    if (!token) {
      console.log(
        chalk.yellow(
          "🔑 No API token found. Please provide your OpenAI API token."
        )
      );
      console.log(
        chalk.blue(
          "   You can get your token from: https://platform.openai.com/api-keys\n"
        )
      );

      const { apiToken } = await inquirer.prompt([
        {
          type: "password",
          name: "apiToken",
          message: "Enter your OpenAI API token:",
          validate: (input: string) => {
            if (!input.trim()) {
              return "API token cannot be empty";
            }
            if (!input.startsWith("sk-")) {
              return "API token should start with 'sk-'";
            }
            return true;
          },
        },
      ]);

      token = apiToken.trim();

      // Ask if user wants to save the token
      const { saveToken } = await inquirer.prompt([
        {
          type: "confirm",
          name: "saveToken",
          message: "Save this token securely for future use?",
          default: true,
        },
      ]);

      if (saveToken) {
        this.tokenManager.setToken(token!);
      }
    }

    return token!;
  }

  private async showTokenManagementMenu(): Promise<void> {
    const choices = [
      { name: "Set new API token", value: "set" },
      { name: "Clear stored token", value: "clear" },
      { name: "View token status", value: "status" },
      { name: "Back to main menu", value: "back" },
    ];

    const { action } = await inquirer.prompt([
      {
        type: "list",
        name: "action",
        message: "Token Management:",
        choices,
      },
    ]);

    switch (action) {
      case "set":
        await this.setNewToken();
        break;
      case "clear":
        this.tokenManager.clearToken();
        break;
      case "status":
        this.showTokenStatus();
        break;
      case "back":
        return;
    }
  }

  private async setNewToken(): Promise<void> {
    const { apiToken } = await inquirer.prompt([
      {
        type: "password",
        name: "apiToken",
        message: "Enter your OpenAI API token:",
        validate: (input: string) => {
          if (!input.trim()) {
            return "API token cannot be empty";
          }
          if (!input.startsWith("sk-")) {
            return "API token should start with 'sk-'";
          }
          return true;
        },
      },
    ]);

    this.tokenManager.setToken(apiToken.trim());
  }

  private showTokenStatus(): void {
    const hasToken = this.tokenManager.hasToken();
    const status = hasToken
      ? chalk.green("✅ Token stored")
      : chalk.red("❌ No token stored");
    console.log(`\nToken Status: ${status}`);

    if (hasToken) {
      const token = this.tokenManager.getToken();
      if (token) {
        const maskedToken = `${token.substring(0, 7)}...${token.substring(
          token.length - 4
        )}`;
        console.log(`Token: ${maskedToken}`);
      }
    }
    console.log();
  }

  async generateCommitSuggestions(diff: string): Promise<{
    suggestedTypes: string[];
    suggestedScopes: string[];
    commitMessages: string[];
  }> {
    const token = await this.getOrRequestToken();
    this.openai = new OpenAI({ apiKey: token });

    const prompt = `
Analyze the following git diff and suggest:
1. Top 3 most appropriate conventional commit types from: ${COMMIT_TYPES.map(
      (t) => t.type
    ).join(", ")}
2. Top 3 most relevant scopes (component/module names, keep them short)
3. 2 clear, concise commit messages (without type/scope prefix)

Git diff:
${diff}

Respond in JSON format:
{
  "types": ["type1", "type2", "type3"],
  "scopes": ["scope1", "scope2", "scope3"],
  "messages": ["message1", "message2"]
}

Guidelines:
- Messages should be imperative mood, lowercase, no period
- Messages should be specific but concise
- Scopes should be short (1-2 words max)
- Focus on what changed and implementation details
- Message should explain the changes in a way that is easy to understand
- Should focus on the details of the changes
- your response should be parsed by JSON.parse
- do not specify code block type like '''json on response. Just give us plain json so it can be parsed by JSON.parse`;

    try {
      const response = await this.openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "commit_suggestions",
            schema: {
              type: "object",
              properties: {
                types: { type: "array", items: { type: "string" } },
                scopes: { type: "array", items: { type: "string" } },
                messages: { type: "array", items: { type: "string" } },
              },
              required: ["types", "scopes", "messages"],
            },
          },
        },
        // max_tokens: 500,
      });

      const content = response.choices[0]?.message?.content;
      if (!content) throw new Error("No response from OpenAI");

      const parsed = JSON.parse(content);
      return {
        suggestedTypes: parsed.types || [],
        suggestedScopes: parsed.scopes || [],
        commitMessages: parsed.messages || [],
      };
    } catch (error) {
      console.error(chalk.red("❌ Failed to generate AI suggestions:"), error);
      return {
        suggestedTypes: ["feat", "fix", "chore"],
        suggestedScopes: [],
        commitMessages: ["update code", "improve functionality"],
      };
    }
  }

  getGitDiff(): string {
    try {
      // Get staged changes
      let diff = execSync("git diff --cached", { encoding: "utf8" });

      // If no staged changes, get unstaged changes
      if (!diff.trim()) {
        diff = execSync("git diff", { encoding: "utf8" });
      }

      if (!diff.trim()) {
        console.log(
          chalk.yellow(
            "⚠️  No changes detected. Make sure you have staged changes or unstaged changes."
          )
        );
        process.exit(0);
      }

      return diff;
    } catch (error) {
      console.error(chalk.red("❌ Failed to get git diff:"), error);
      process.exit(1);
    }
  }

  async selectCommitType(suggested: string[]): Promise<string> {
    const choices = COMMIT_TYPES.map(({ type, description, emoji }) => ({
      name: `${emoji} ${type}: ${description}${
        suggested.includes(type) ? " (suggested)" : ""
      }`,
      value: type,
      short: type,
    }));

    // Put suggested types first
    const suggestedChoices = choices.filter((c) => suggested.includes(c.value));
    const otherChoices = choices.filter((c) => !suggested.includes(c.value));

    const { type } = await inquirer.prompt([
      {
        type: "list",
        name: "type",
        message: "Select commit type:",
        choices: [
          ...suggestedChoices,
          new inquirer.Separator(),
          ...otherChoices,
        ],
        pageSize: 15,
      },
    ]);

    return type;
  }

  async selectScope(suggested: string[]): Promise<string> {
    const choices = [
      { name: "Skip scope", value: "" },
      ...suggested.map((scope) => ({ name: scope, value: scope })),
      { name: "Custom scope", value: "custom" },
    ];

    const { scope } = await inquirer.prompt([
      {
        type: "list",
        name: "scope",
        message: "Select scope (or skip):",
        choices,
      },
    ]);

    if (scope === "custom") {
      const { customScope } = await inquirer.prompt([
        {
          type: "input",
          name: "customScope",
          message: "Enter custom scope:",
          validate: (input: string) =>
            input.length > 0 || "Scope cannot be empty",
        },
      ]);
      return customScope;
    }

    return scope;
  }

  async selectCommitMessage(suggested: string[]): Promise<string> {
    const choices = [
      ...suggested.map((msg) => ({ name: msg, value: msg })),
      { name: "Custom message", value: "custom" },
    ];

    const { message } = await inquirer.prompt([
      {
        type: "list",
        name: "message",
        message: "Select commit message:",
        choices,
      },
    ]);

    if (message === "custom") {
      const { customMessage } = await inquirer.prompt([
        {
          type: "input",
          name: "customMessage",
          message: "Enter custom message:",
          validate: (input: string) =>
            input.length > 0 || "Message cannot be empty",
        },
      ]);
      return customMessage;
    }

    return message;
  }

  formatCommitMessage(type: string, scope: string, message: string): string {
    const commitType = COMMIT_TYPES.find((t) => t.type === type);
    const emoji = commitType?.emoji || "";
    const scopeStr = scope ? `(${scope})` : "";

    return `${type}${scopeStr}: ${emoji} ${message}`;
  }

  async commitChanges(message: string): Promise<void> {
    try {
      // Stage all changes if nothing is staged
      const stagedFiles = execSync("git diff --cached --name-only", {
        encoding: "utf8",
      }).trim();
      if (!stagedFiles) {
        console.log(chalk.blue("ℹ️  Staging all changes..."));
        execSync("git add .");
      }

      // Commit
      execSync(`git commit -m "${message}"`, { stdio: "inherit" });
      console.log(chalk.green("✅ Commit successful!"));
    } catch (error) {
      console.error(chalk.red("❌ Failed to commit:"), error);
      process.exit(1);
    }
  }

  async run(): Promise<void> {
    // Check command line arguments first
    const args = process.argv.slice(2);

    if (args.includes("--help") || args.includes("-h")) {
      this.showHelp();
      return;
    }

    if (args.includes("--token")) {
      console.log(
        chalk.blue.bold(
          "🤖 AI Conventional Commit Generator - Token Management\n"
        )
      );
      await this.showTokenManagementMenu();
      return;
    }

    console.log(chalk.blue.bold("🤖 AI Conventional Commit Generator\n"));

    // Check if we're in a git repository
    if (!existsSync(".git")) {
      console.error(chalk.red("❌ Not in a git repository"));
      process.exit(1);
    }

    // Default behavior: generate commit
    await this.generateCommit();
  }

  private showHelp(): void {
    console.log(chalk.blue.bold("🤖 AI Conventional Commit Generator\n"));
    console.log("Usage:");
    console.log("  ai-cz              Generate a commit (default)");
    console.log("  ai-cz --token      Manage OpenAI API token");
    console.log("  ai-cz --help       Show this help message");
    console.log();
  }

  private async generateCommit(): Promise<void> {
    try {
      // Get git diff
      console.log(chalk.blue("📊 Analyzing changes..."));
      const diff = this.getGitDiff();

      // Generate AI suggestions
      console.log(chalk.blue("🧠 Generating AI suggestions..."));
      const suggestions = await this.generateCommitSuggestions(diff);

      // Interactive selection
      console.log(chalk.green("✨ Ready to create your commit!\n"));

      const selectedType = await this.selectCommitType(
        suggestions.suggestedTypes
      );
      const selectedScope = await this.selectScope(suggestions.suggestedScopes);
      const selectedMessage = await this.selectCommitMessage(
        suggestions.commitMessages
      );

      // Format and preview commit message
      const finalMessage = this.formatCommitMessage(
        selectedType,
        selectedScope,
        selectedMessage
      );

      console.log(chalk.yellow("\n📝 Commit message preview:"));
      console.log(chalk.cyan(`   ${finalMessage}\n`));

      // Confirm and commit
      const { confirm } = await inquirer.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: "Proceed with this commit?",
          default: true,
        },
      ]);

      if (confirm) {
        await this.commitChanges(finalMessage);
      } else {
        console.log(chalk.yellow("❌ Commit cancelled"));
      }
    } catch (error) {
      console.error(chalk.red("❌ An error occurred:"), error);
      process.exit(1);
    }
  }
}

// Main execution
if (import.meta.main) {
  const generator = new AICommitGenerator();
  generator.run().catch(console.error);
}
