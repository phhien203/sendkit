---
name: sendkit
description: Send Telegram messages from agents with SendKit, using the SendKit MCP `telegram` tool when it's available and the `sendkit` CLI as a fallback. Use this skill whenever the user asks to send, ping, notify, or alert someone on Telegram, mentions SendKit or the sendkit toolset, wants to set up or verify SendKit manually, or is choosing between the SendKit MCP server and the CLI, even if they don't name SendKit explicitly.
compatibility: Requires a Telegram bot token. The MCP path needs the SendKit MCP server configured in the agent's MCP client. The CLI path needs Node.js 20+ and `@hienpage/sendkit` from npm.
---

# SendKit

SendKit sends Telegram messages through a Telegram bot that the user owns. There are two ways to reach it, and both produce the same result:

- **MCP tool** (`@hienpage/sendkit-mcp`): a `telegram` tool exposed by a SendKit MCP server. Clients name it differently, for example `telegram` under a `sendkit` server or `mcp__sendkit__telegram`.
- **CLI** (`@hienpage/sendkit`): the `sendkit` command.

Both call the Telegram Bot API `sendMessage` endpoint. Only setup and token storage differ.

## Choose a path

Use the **MCP tool** if a SendKit `telegram` tool is in your tool list. It needs no shell access and returns structured output.

Use the **CLI** when:
- no SendKit MCP tool is available, or the MCP server failed to start or reports a missing token;
- the user asks for the CLI, or wants to check SendKit from a terminal;
- the message is sent by something other than an agent, such as a cron job, CI step, or shell script. The CLI reads a config file, so no MCP client is needed.

Send each message through one path only. If an MCP call might have succeeded (for example, it timed out instead of returning an error), ask the user before retrying through the CLI. A duplicate alert is annoying, and a message can't be unsent.

## Inputs

| Field     | Type   | Notes |
| --------- | ------ | ----- |
| `chatId`  | string | A numeric user or group ID (groups usually start with `-100`), or a public channel username such as `@my_channel`. Always pass it as a string. |
| `message` | string | Non-empty plain text. It's sent exactly as written, with no Markdown or HTML formatting. |

If the user hasn't given a chat ID, ask for it. Don't guess, and don't reuse an ID from an unrelated earlier task without checking. Sending to the wrong chat can leak information to the wrong people.

The bot can only message users who have pressed **Start** in a chat with it, and groups or channels it has been added to. For a channel, the bot must be an admin.

## Workflow A: MCP tool

Call the tool with:

```json
{ "chatId": "123456789", "message": "Build finished ✅" }
```

On success it returns text such as `Sent Telegram message 42 to chat 123456789` plus structured content:

```json
{ "ok": true, "chatId": "123456789", "messageId": 42 }
```

### Setting up the MCP server

If the user wants to add the server, the usual MCP client config looks like this:

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

The server reads the bot token only from the `TELEGRAM_BOT_TOKEN` environment variable. The client must be restarted, or the server reloaded, before the tool appears. Tell the user to keep this config file out of version control because it contains the token.

## Workflow B: CLI

1. **Find the CLI.** Run `sendkit --help`. If `sendkit` isn't installed, use `npx -y @hienpage/sendkit --help` instead. This downloads the package from npm, so tell the user. They can also install it permanently with `npm install -g @hienpage/sendkit`.
2. **Check the bot token.** The CLI reads the token only from `~/.config/sendkit/config.json`. It ignores `TELEGRAM_BOT_TOKEN`. If the file is missing, the user runs this once:
   ```bash
   sendkit init --telegram-bot-token <bot-token>
   ```
   Ask the user to run it themselves (in Claude Code: `! sendkit init --telegram-bot-token <token>`) rather than pasting the token into the chat. A token in the chat stays in the transcript and logs. The command writes the config file with owner-only permissions (`0600`).
3. **Send the message:**
   ```bash
   sendkit telegram -- <chatId> '<message>'
   ```
   - Put `--` before the arguments. Without it, a message that starts with `-` (such as `- deploy done`) is read as an option, and the command fails. Negative group IDs work either way.
   - Quote the message with single quotes so the shell doesn't expand `$`, backticks, or `!`. If the text contains a single quote, write it as `'\''`.
4. **Read the result.** On success the command prints one line of JSON and exits with code `0`:
   ```json
   {"ok":true,"chatId":"123456789","messageId":42}
   ```
   On failure it prints the error to stderr and exits with code `1`. Scripts should check the exit code.

## First-time setup (no bot yet)

1. In Telegram, message [@BotFather](https://t.me/BotFather), send `/newbot`, and follow the prompts to get a bot token. Treat the token like a password: anyone who has it can send messages as the bot.
2. Get the chat ID. Open a chat with the bot and press **Start** (or add the bot to the group). Then the user opens `https://api.telegram.org/bot<token>/getUpdates` in their own browser and reads `message.chat.id`. The user should open this link themselves because the token is part of the URL.
3. Configure the MCP server or the CLI as described above.

## Verify SendKit manually

When the user asks whether SendKit works:

1. Confirm the chat ID, and confirm the user is OK with a test message, because it really gets delivered.
2. Send a short, clearly labeled test such as `SendKit test message (safe to ignore)` through the path you're checking.
3. Check that the result has `ok: true` and a numeric `messageId`. Then ask the user to confirm the message arrived in Telegram.
4. If you test both paths, report which `messageId` came from MCP and which came from the CLI.

## Troubleshooting

| Error | Likely cause and fix |
| ----- | -------------------- |
| `TELEGRAM_BOT_TOKEN is required…` | The MCP server has no token in its environment. Add it to the MCP client config and restart, or use the CLI. |
| `Telegram bot token is required. Run \`sendkit init\`.` | The CLI config is missing. The user runs `sendkit init --telegram-bot-token <token>`. |
| `Unauthorized` | The bot token is wrong or was revoked. Get a new one from @BotFather and update the config. |
| `Bad Request: chat not found` | The chat ID is wrong, or the user or group hasn't started or added the bot. |
| `Forbidden: bot was blocked by the user` | The recipient blocked the bot. Only the recipient can unblock it. |
| `Forbidden: bot is not a member of the channel chat` | Add the bot to the channel as an admin. |
| `Too Many Requests: retry after N` | Telegram is rate-limiting the bot. Wait N seconds before retrying, and don't retry in a tight loop. |
| `Chat ID is required` / `Message is required` | A value was empty. Ask the user for it. |
| `error: unknown option '-…'` (CLI) | The message starts with `-` and was read as an option. Put `--` before the arguments. |

## Safety

- A sent message is visible to people outside this session and can't be recalled. Send only what the user asked for, to the chat they named. Confirm first when the recipient or the content is unclear.
- Never print, log, echo, or commit a bot token, and don't ask the user to paste one into the chat. If you see a token in a file that is committed or about to be committed, tell the user and suggest revoking it with @BotFather.
