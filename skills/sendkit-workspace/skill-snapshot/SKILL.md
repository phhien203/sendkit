---
name: sendkit
description: Use SendKit to send Telegram messages from agents through the SendKit MCP tools, with the `sendkit` CLI as a fallback. Use when the user asks to send a Telegram message, mentions SendKit, wants to interact with the SendKit toolset, wants to verify SendKit manually, or needs to choose between the SendKit MCP and CLI workflows.
---

# SendKit

SendKit sends Telegram messages through a Telegram bot. Agents can reach it two ways:

1. **MCP tool** (preferred): the `telegram` tool exposed by the `sendkit` MCP server (local `@hienpage/sendkit-mcp` over stdio, or the hosted remote MCP over HTTP).
2. **CLI** (fallback): the `sendkit` command from `@hienpage/sendkit`.

Both call the same core (`@hienpage/sendkit-core`), which posts to the Telegram Bot API `sendMessage` endpoint. Behavior and results are identical; only the setup and how the bot token is supplied differ.

## Choosing MCP vs CLI

Use the **MCP tool** when:
- A SendKit `telegram` tool is in your tool list (often named `mcp__sendkit__telegram` or similar).
- You want structured output without parsing shell text.

Use the **CLI** when:
- No SendKit MCP tool is available in this session, or the MCP server failed to start.
- The MCP tool fails with a configuration error (for example, `TELEGRAM_BOT_TOKEN is required`) and you can't fix the MCP client config right now.
- The user explicitly asks for the CLI, or wants to verify SendKit manually from a terminal.

Don't send the same message through both paths. If the MCP call might have succeeded (for example, it timed out instead of failing), ask before retrying through the CLI so the recipient doesn't get a duplicate.

## Inputs

Both paths take the same two values:

| Field     | Type   | Notes                                                                 |
| --------- | ------ | --------------------------------------------------------------------- |
| `chatId`  | string | Telegram chat ID: numeric user/group ID (groups are often negative, like `-100…`) or a public channel username like `@my_channel`. Always pass it as a string. |
| `message` | string | Non-empty plain text. It's sent as-is, with no Markdown/HTML parse mode. |

If the user hasn't given a chat ID, ask for it. Don't guess one, and don't reuse an ID from an unrelated earlier task without confirming. The bot can only message chats that have started it or that it has been added to.

## Workflow A: MCP tool

Call the `telegram` tool:

```json
{ "chatId": "123456789", "message": "Build finished ✅" }
```

On success it returns text like `Sent Telegram message 42 to chat 123456789` plus structured content:

```json
{ "ok": true, "chatId": "123456789", "messageId": 42 }
```

Token setup depends on which server is used:
- **Local MCP** (`sendkit-mcp`): reads `TELEGRAM_BOT_TOKEN` from the MCP client's environment config. Example for an MCP client config:
  ```json
  {
    "mcpServers": {
      "sendkit": {
        "command": "npx",
        "args": ["-y", "@hienpage/sendkit-mcp"],
        "env": { "TELEGRAM_BOT_TOKEN": "<bot-token>" }
      }
    }
  }
  ```
  When developing in this repo, run it with `bun run dev:local-mcp`.
- **Remote MCP**: the bot token is part of the server URL path (`/<botToken>/mcp`) and requests are authenticated with Clerk OAuth. The agent doesn't handle the token directly.

## Workflow B: CLI fallback

1. Check that the CLI is available: `sendkit --help` (or `npx @hienpage/sendkit --help`; in this repo, `bun run dev:cli --help`).
2. Configure the bot token once. It's saved to `~/.config/sendkit/config.json` with mode `0600`:
   ```bash
   sendkit init --telegram-bot-token <bot-token>
   ```
   Only run `init` with a token the user gave you. If the config is missing, ask the user to run it themselves (for example, `! sendkit init --telegram-bot-token <token>`) so the token doesn't end up in your transcript.
3. Send:
   ```bash
   sendkit telegram <chatId> "<message>"
   ```
   Quote the message so the shell passes it as one argument. For messages that contain quotes, `$`, or backticks, use single quotes or a heredoc variable.
4. On success it prints one JSON line to stdout:
   ```json
   {"ok":true,"chatId":"123456789","messageId":42}
   ```
   On failure it prints the error to stderr and exits with code `1`.

Note: the CLI does **not** read `TELEGRAM_BOT_TOKEN`. It only uses the config file written by `sendkit init`.

## Verifying SendKit manually

Use this when the user asks you to check that SendKit works end to end:

1. Confirm the target `chatId` with the user, and confirm a test message is OK to send. It will really be delivered.
2. Send a short, clearly labeled test such as `"SendKit test message"` through the path being verified (MCP tool or CLI).
3. Check the result: `ok: true` and a numeric `messageId`. Ask the user to confirm the message showed up in Telegram.
4. To verify both paths, send one test through each and say which `messageId` came from which path.

## Troubleshooting

| Error                                                  | Cause / fix                                                                                     |
| ------------------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `TELEGRAM_BOT_TOKEN is required…`                      | Local MCP server has no token in its env. Add it to the MCP client config and restart, or use the CLI. |
| `Telegram bot token is required. Run \`sendkit init\`.` | CLI config is missing. Have the user run `sendkit init --telegram-bot-token <token>`.            |
| `Unauthorized`                                         | Bot token is invalid or revoked (Telegram 401), or remote MCP OAuth failed.                      |
| `Bad Request: chat not found`                          | Wrong `chatId`, or the user/group hasn't started or added the bot.                               |
| `Forbidden: bot was blocked by the user`               | The recipient blocked the bot. Only they can fix this.                                           |
| Validation error (`Chat ID is required` / `Message is required`) | Empty `chatId` or `message`. Ask the user for the missing value.                       |

## Safety

- Sending a message is outward-facing and can't be undone. Confirm the recipient and content when either is unclear, and never send messages the user didn't ask for.
- Never print, log, or commit bot tokens. If you find a token in a tracked file, point it out to the user.
