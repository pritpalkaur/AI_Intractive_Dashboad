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
    description: 'To try the protected endpoints: call **POST /api/auth/login**, copy the `token` from the response, '
      + 'click **Authorize** and paste it in.\n\n'
      + '⚠️ **POST /api/products/save** changes real prices in the database and sends an email.',
  },
  tags: [{ name: 'Auth' }, { name: 'Products' }],
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
  },
};
