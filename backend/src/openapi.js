// OpenAPI description of the REST API, served by Swagger UI at /api/docs.
const error = description => ({
  description,
  content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
});

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'Interactive Dashboard API',
    version: '1.0.0',
    description: 'To try the protected endpoints: call **POST /api/auth/signup** (new account) or **POST /api/auth/login**, copy the `token` from the response, '
      + 'click **Authorize** and paste it in.\n\n'
      + '⚠️ **POST /api/products/save** changes real prices in the database and sends an email.',
  },
  tags: [{ name: 'Auth' }, { name: 'Products' }, { name: 'AI assistant' }],
  components: {
    securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Error: {
        type: 'object',
        properties: { ok: { type: 'boolean', example: false }, error: { type: 'string' } },
      },
      User: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 1 },
          email: { type: 'string', format: 'email', example: 'someone@gmail.com' },
          name: { type: 'string', example: 'Some One' },
        },
      },
      Product: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 17 },
          label: { type: 'string', example: 'Mechanical Keyboard' },
          value: { type: 'number', example: 89 },
          isUpdated: { type: 'boolean', description: 'Update flag, set when the price was saved from the dashboard' },
          updatedAt: { type: 'string', format: 'date-time', nullable: true },
        },
      },
      PriceChange: {
        type: 'object',
        properties: {
          id: { type: 'integer', example: 17 },
          label: { type: 'string', example: 'Mechanical Keyboard' },
          oldValue: { type: 'number', example: 89 },
          newValue: { type: 'number', example: 79.99 },
        },
      },
    },
  },
  paths: {
    '/api/auth/signup': {
      post: {
        tags: ['Auth'],
        summary: 'Register a new account (also logs you in)',
        description: 'Creates the account, emails a welcome message, and returns a JWT like login does. '
          + 'If the welcome email fails the account is still created and `email.error` says why.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'name', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'someone@gmail.com' },
                  name: { type: 'string', maxLength: 100, example: 'Some One' },
                  password: { type: 'string', format: 'password', minLength: 8, example: 'at-least-8-chars' },
                },
              },
            },
          },
        },
        responses: {
          201: {
            description: 'Account created. Use `token` as the Bearer token.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    token: { type: 'string' },
                    user: { $ref: '#/components/schemas/User' },
                    email: {
                      type: 'object',
                      properties: {
                        to: { type: 'string', format: 'email' },
                        sent: { type: 'boolean' },
                        error: { type: 'string', nullable: true },
                      },
                    },
                  },
                },
              },
            },
          },
          400: error('Invalid email, name or password'),
          409: error('An account with this email already exists'),
        },
      },
    },
    '/api/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Email a password reset link',
        description: 'If the email belongs to an account, a one-time link valid for 30 minutes is emailed to it. '
          + 'The response is the same whether or not the account exists. The token is the `reset` value in the link.',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email'],
                properties: { email: { type: 'string', format: 'email', example: 'someone@gmail.com' } },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Request accepted',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ok: { type: 'boolean', example: true }, message: { type: 'string' } },
                },
              },
            },
          },
          400: error('Invalid email'),
        },
      },
    },
    '/api/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Set a new password using the token from the reset email',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'password'],
                properties: {
                  token: { type: 'string', description: 'The `reset` value from the emailed link (64 hex characters)' },
                  password: { type: 'string', format: 'password', minLength: 8, example: 'my-new-password' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Password changed',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { ok: { type: 'boolean', example: true }, message: { type: 'string' } },
                },
              },
            },
          },
          400: error('Invalid password, or the link is invalid, expired or already used'),
        },
      },
    },
    '/api/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Log in and get a JWT',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', format: 'email', example: 'someone@gmail.com' },
                  password: { type: 'string', format: 'password', example: 'at-least-8-chars' },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Logged in. Use `token` as the Bearer token.',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    token: { type: 'string' },
                    user: { $ref: '#/components/schemas/User' },
                  },
                },
              },
            },
          },
          400: error('Email or password missing'),
          401: error('Incorrect email or password'),
        },
      },
    },
    '/api/products': {
      get: {
        tags: ['Products'],
        summary: 'List products with their prices and update flag',
        security: [{ bearerAuth: [] }],
        responses: {
          200: {
            description: 'Products',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Product' } },
                  },
                },
              },
            },
          },
          401: error('Missing, invalid or expired token'),
        },
      },
    },
    '/api/products/save': {
      post: {
        tags: ['Products'],
        summary: 'Save changed prices, set the update flag, and email the logged-in user',
        description: 'Send only the products whose price changed. All prices are saved in one transaction. '
          + 'If the email fails the save still succeeds and `email.error` says why.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['data'],
                properties: {
                  data: {
                    type: 'array',
                    minItems: 1,
                    items: {
                      type: 'object',
                      required: ['id', 'value'],
                      properties: {
                        id: { type: 'integer', example: 17 },
                        label: { type: 'string', example: 'Mechanical Keyboard' },
                        value: { type: 'number', minimum: 0, maximum: 99999999.99, example: 79.99 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Saved',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    savedAt: { type: 'string', format: 'date-time' },
                    changes: { type: 'array', items: { $ref: '#/components/schemas/PriceChange' } },
                    email: {
                      type: 'object',
                      properties: {
                        to: { type: 'string', format: 'email' },
                        sent: { type: 'boolean' },
                        error: { type: 'string', nullable: true },
                      },
                    },
                    data: { type: 'array', items: { $ref: '#/components/schemas/Product' } },
                  },
                },
              },
            },
          },
          400: error('Invalid request, or a product no longer exists'),
          401: error('Missing, invalid or expired token'),
        },
      },
    },
    '/api/agent': {
      post: {
        tags: ['AI assistant'],
        summary: 'Ask the AI assistant (Claude) a question or for price changes',
        description: 'Send the chat so far and the prices currently shown in the browser. The assistant only **proposes** changes '
          + '(`changes`, final price per product id) and may ask the dashboard to `save`, `discard` or `undo` (`action`). '
          + 'Nothing is written to the database by this endpoint. Returns 503 when `ANTHROPIC_API_KEY` is not set on the server.',
        security: [{ bearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['messages', 'products'],
                properties: {
                  messages: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 20,
                    description: 'Plain-text chat turns, oldest first. The last one must be from the user.',
                    items: {
                      type: 'object',
                      required: ['role', 'content'],
                      properties: {
                        role: { type: 'string', enum: ['user', 'assistant'] },
                        content: { type: 'string', minLength: 1, maxLength: 2000, example: 'Make everything under $20 ten percent more expensive' },
                      },
                    },
                  },
                  products: {
                    type: 'array',
                    minItems: 1,
                    maxItems: 500,
                    description: 'Prices currently shown in the browser (including unsaved changes).',
                    items: {
                      type: 'object',
                      required: ['id', 'value'],
                      properties: {
                        id: { type: 'integer', example: 16 },
                        label: { type: 'string', example: 'USB-C Charging Cable 2m' },
                        value: { type: 'number', description: 'Price on screen', example: 9.5 },
                        savedValue: { type: 'number', description: 'Price in the database', example: 9.5 },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        responses: {
          200: {
            description: 'Assistant reply and proposed changes',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    ok: { type: 'boolean', example: true },
                    reply: { type: 'string', example: 'USB-C Charging Cable 2m: 9.50 → 10.45' },
                    changes: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { id: { type: 'integer', example: 16 }, value: { type: 'number', example: 10.45 } },
                      },
                    },
                    action: { type: 'string', enum: ['save', 'discard', 'undo'], nullable: true },
                    toolCalls: {
                      type: 'array',
                      items: {
                        type: 'object',
                        properties: { name: { type: 'string', example: 'set_prices' }, input: { type: 'object' } },
                      },
                    },
                  },
                },
              },
            },
          },
          400: error('Invalid messages or products'),
          401: error('Missing, invalid or expired token'),
          500: error('The AI assistant failed'),
          503: error('AI assistant is not configured on the server'),
        },
      },
    },
  },
};
