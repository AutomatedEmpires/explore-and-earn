// The OpenAPI 3.1 document for /api/v1 (spec section 4), generated from the zod schemas that
// routes already validate with. `apiRoute` registers every route that passes `openapi`; the
// /api/v1/openapi.json route imports each such route file so the registry is complete.
import { z } from 'zod';
import type { AuthMode, HttpMethod } from './api';

export type RouteDoc = {
  method: HttpMethod;
  /** With dynamic segments as `{name}`. */
  path: string;
  summary: string;
  auth?: AuthMode;
  input?: z.ZodType;
  output?: z.ZodType;
};

type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  [key: string]: unknown;
};

type Parameter = { name: string; in: 'path' | 'query'; required: boolean; schema: JsonSchema };

type MediaContent = Record<string, { schema: JsonSchema }>;

export type Operation = {
  summary: string;
  operationId: string;
  tags: string[];
  parameters?: Parameter[];
  requestBody?: { required: boolean; content: MediaContent };
  responses: Record<string, { description: string; content?: MediaContent }>;
  security: Record<string, string[]>[];
  'x-auth': AuthMode;
};

export type OpenApiDocument = {
  openapi: '3.1.0';
  info: { title: string; version: string; description: string };
  paths: Record<string, Partial<Record<Lowercase<HttpMethod>, Operation>>>;
  components: {
    schemas: Record<string, JsonSchema>;
    securitySchemes: Record<string, Record<string, string>>;
  };
};

const routes = new Map<string, RouteDoc>();

/** Adds (or replaces) one route in the document. Called by `apiRoute` at module load. */
export function registerRoute(r: RouteDoc): void {
  routes.set(`${r.method} ${r.path}`, r);
}

const ERROR_ENVELOPE = z.object({
  error: z.object({
    code: z.enum([
      'bad_request',
      'unauthorized',
      'forbidden',
      'not_found',
      'conflict',
      'rate_limited',
      'internal',
    ]),
    message: z.string(),
    details: z.unknown().optional(),
    requestId: z.string(),
  }),
});

function toSchema(schema: z.ZodType, io: 'input' | 'output'): JsonSchema {
  const json = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
    unrepresentable: 'any',
  }) as JsonSchema;
  delete json.$schema;
  return json;
}

function pathParamNames(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1] ?? '').filter(Boolean);
}

function operationId(method: HttpMethod, path: string): string {
  const words = path
    .replace(/^\/api\/v1\/?/, '')
    .split(/[/{}.-]+/)
    .filter(Boolean);
  return [method.toLowerCase(), ...words].join('_');
}

function operation(r: RouteDoc): Operation {
  const auth = r.auth ?? 'none';
  const pathNames = pathParamNames(r.path);
  const input = r.input ? toSchema(r.input, 'input') : undefined;
  const properties = input?.properties ?? {};
  const required = new Set(input?.required ?? []);

  const parameters: Parameter[] = pathNames.map((name) => ({
    name,
    in: 'path',
    required: true,
    schema: properties[name] ?? { type: 'string' },
  }));

  let requestBody: Operation['requestBody'];
  if (input && r.method === 'GET') {
    for (const [name, schema] of Object.entries(properties)) {
      if (pathNames.includes(name)) continue;
      parameters.push({ name, in: 'query', required: required.has(name), schema });
    }
  } else if (input) {
    const body: JsonSchema = { ...input };
    if (input.properties) {
      body.properties = Object.fromEntries(
        Object.entries(input.properties).filter(([name]) => !pathNames.includes(name)),
      );
    }
    if (input.required) {
      const rest = input.required.filter((name) => !pathNames.includes(name));
      if (rest.length > 0) body.required = rest;
      else delete body.required;
    }
    requestBody = { required: true, content: { 'application/json': { schema: body } } };
  }

  const success = r.output
    ? {
        '200': {
          description: 'OK',
          content: { 'application/json': { schema: toSchema(r.output, 'output') } },
        },
      }
    : { '200': { description: 'OK' } };

  const op: Operation = {
    summary: r.summary,
    operationId: operationId(r.method, r.path),
    tags: [r.path.replace(/^\/api\/v1\//, '').split('/')[0] || 'api'],
    responses: {
      ...success,
      default: {
        description: 'Error',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
      },
    },
    security: auth === 'none' ? [] : [{ session: [] }, { bearer: [] }],
    'x-auth': auth,
  };
  if (parameters.length > 0) op.parameters = parameters;
  if (requestBody) op.requestBody = requestBody;
  return op;
}

/** The OpenAPI 3.1 document for every registered route. */
export function buildOpenApi(): OpenApiDocument {
  const paths: OpenApiDocument['paths'] = {};
  const sorted = [...routes.values()].sort(
    (a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method),
  );
  for (const r of sorted) {
    const method = r.method.toLowerCase() as Lowercase<HttpMethod>;
    paths[r.path] = { ...paths[r.path], [method]: operation(r) };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Explore&Earn API',
      version: 'v1',
      description:
        'Errors use one envelope: { error: { code, message, details?, requestId } }. ' +
        'State-changing requests from a browser must come from the app origin.',
    },
    paths,
    components: {
      schemas: { Error: toSchema(ERROR_ENVELOPE, 'output') },
      securitySchemes: {
        session: { type: 'apiKey', in: 'cookie', name: '__session' },
        bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  };
}
