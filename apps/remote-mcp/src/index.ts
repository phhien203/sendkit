import { Hono } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp';

import { sendTelegramMessage, telegramMessageInputSchema } from 'sendkit-core';

function createServer(botToken: string) {
  const server = new McpServer({
    name: 'sendkit-remote',
    version: '0.0.0',
  });

  server.registerTool(
    'telegram',
    {
      title: 'Telegram',
      description: 'Send a Telegram message',
      inputSchema: telegramMessageInputSchema.shape,
    },
    async (input) => {
      const result = await sendTelegramMessage({
        ...input,
        botToken: botToken,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Sent Telegram message ${result.messageId} to chat ${result.chatId}`,
          },
        ],
        structuredContent: result,
      };
    },
  );

  return server;
}

const app = new Hono();

app.post('/:botToken/mcp', async (context) => {
  const botToken = context.req.param('botToken');
  const server = createServer(botToken);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  await server.connect(transport);

  try {
    return await transport.handleRequest(context.req.raw);
  } finally {
    server.close();
  }
});

app.notFound((context) => {
  return context.json({ error: 'Not found' }, 404);
});

const port = Number(process.env.PORT ?? 3000);

export default {
  port,
  fetch: app.fetch,
};
