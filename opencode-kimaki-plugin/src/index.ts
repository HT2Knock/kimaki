// OpenCode plugin entry point for @kimaki/opencode-plugin.
// Each export is treated as a separate plugin by OpenCode's plugin loader.
//
// Currently provides Anthropic OAuth authentication for Claude Pro/Max
// subscription users. Future exports will add more standalone features
// from kimaki that work without the Discord bot.
//
// Usage in opencode.json:
//   { "plugin": ["@kimaki/opencode-plugin"] }
//
// Features:
// - OAuth PKCE login flow for Claude Pro/Max subscriptions
// - Automatic token refresh with deduplication
// - System prompt rewriting (OpenCode → Claude Code identity)
// - Tool name mapping so Anthropic API recognizes OpenCode tools
// - Beta header injection (claude-code, oauth, streaming, thinking)
// - Multi-account store with automatic rotation on rate limits
// - Cost zeroing for OAuth users (subscription covers usage)
// - API key creation from OAuth access token
//
// The plugin stores credentials in ~/.local/share/opencode/auth.json
// and account rotation state in anthropic-oauth-accounts.json.
// No SQLite, no Discord bot, no extra infrastructure required.

export { anthropicAuthPlugin, replacer } from 'kimaki/anthropic-auth-plugin'
