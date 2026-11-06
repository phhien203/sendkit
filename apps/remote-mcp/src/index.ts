import { Hono, type Context } from 'hono';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp';
import { createClerkClient } from '@clerk/backend';
import { generateClerkProtectedResourceMetadata } from '@clerk/mcp-tools/server';

import { sendTelegramMessage, telegramMessageInputSchema } from 'sendkit-core';

const clerkPublishableKey = process.env.CLERK_PUBLISHABLE_KEY;
const clerkSecretKey = process.env.CLERK_SECRET_KEY;

if (!clerkPublishableKey) {
  throw new Error('CLERK_PUBLISHABLE_KEY env var is required');
}

if (!clerkSecretKey) {
  throw new Error('CLERK_SECRET_KEY env var is required');
}

const clerkClient = createClerkClient({
  publishableKey: clerkPublishableKey,
  secretKey: clerkSecretKey,
});

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

function protectedResourceMetadataUrl(c: Context, botToken: string) {
  return new URL(
    `/.well-known/oauth-protected-resource/${botToken}/mcp`,
    c.req.url,
  ).toString();
}

function unauthorizedMcpResponse(c: Context, botToken: string) {
  c.header(
    'WWW-Authenticate',
    `Bearer resource_metadata="${protectedResourceMetadataUrl(c, botToken)}"`,
  );

  return c.json({ error: 'Unauthorized' }, 401);
}

app.get('/.well-known/oauth-protected-resource/:botToken/mcp', (context) => {
  return context.json(
    generateClerkProtectedResourceMetadata({
      publishableKey: clerkPublishableKey,
      resourceUrl: new URL(
        `/${context.req.param('botToken')}/mcp`,
        context.req.url,
      ).toString(),
    }),
  );
});

app.post('/:botToken/mcp', async (context) => {
  const botToken = context.req.param('botToken');
  const authHeader = context.req.header('authorization');

  if (!authHeader?.startsWith('Bearer ')) {
    return unauthorizedMcpResponse(context, botToken);
  }

  try {
    const requestState = await clerkClient.authenticateRequest(
      context.req.raw,
      {
        acceptsToken: 'oauth_token',
      },
    );

    if (!requestState.isAuthenticated) {
      return unauthorizedMcpResponse(context, botToken);
    }
  } catch {
    return unauthorizedMcpResponse(context, botToken);
  }

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
  fetch: (req: Request) => {
    const url = new URL(req.url);
    url.protocol = req.headers.get('x-forwarded-proto') ?? url.protocol;
    url.host = req.headers.get('x-forwarded-host') ?? url.host;

    return app.fetch(new Request(url, req));
  },
};
