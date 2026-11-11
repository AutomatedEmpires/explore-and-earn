import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { GET as openapiJson } from '@/app/api/v1/openapi.json/route';
import { buildOpenApi, registerRoute } from './openapi';

const APP_URL = 'http://localhost:3000';

describe('buildOpenApi', () => {
  it('documents the health route (registered by apiRoute)', () => {
    const doc = buildOpenApi();
    expect(doc.openapi).toBe('3.1.0');
    const op = doc.paths['/api/v1/health']?.get;
    expect(op).toBeDefined();
    expect(op?.summary).toBe('Health check');
    expect(op?.responses['200']?.content?.['application/json']?.schema).toMatchObject({
      type: 'object',
      properties: { ok: { const: true } },
    });
    expect(op?.security).toEqual([]);
  });

  it('turns GET input into query parameters and path segments into path parameters', () => {
    registerRoute({
      method: 'GET',
      path: '/api/v1/test-things/{id}',
      summary: 'Read a test thing',
      auth: 'user',
      input: z.object({ id: z.string(), limit: z.coerce.number().int().optional() }),
    });
    const op = buildOpenApi().paths['/api/v1/test-things/{id}']?.get;
    expect(op?.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
      expect.objectContaining({ name: 'limit', in: 'query', required: false }),
    ]);
    expect(op?.requestBody).toBeUndefined();
    expect(op?.security).toEqual([{ session: [] }, { bearer: [] }]);
    expect(op?.responses.default?.content?.['application/json']?.schema).toEqual({
      $ref: '#/components/schemas/Error',
    });
  });

  it('turns POST input into a JSON request body without the path parameters', () => {
    registerRoute({
      method: 'POST',
      path: '/api/v1/test-things/{id}/notes',
      summary: 'Add a note',
      auth: 'operator',
      input: z.object({ id: z.string(), text: z.string().min(1) }),
    });
    const op = buildOpenApi().paths['/api/v1/test-things/{id}/notes']?.post;
    const schema = op?.requestBody?.content['application/json']?.schema;
    expect(schema).toMatchObject({ type: 'object', required: ['text'] });
    expect(schema?.properties).not.toHaveProperty('id');
    expect(op?.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ]);
  });

  it('turns PUT input into a JSON request body without the path parameters', () => {
    registerRoute({
      method: 'PUT',
      path: '/api/v1/test-things/{id}',
      summary: 'Replace',
      auth: 'user',
      input: z.object({ id: z.string(), name: z.string() }),
    });
    const op = buildOpenApi().paths['/api/v1/test-things/{id}']?.put;
    expect(op?.requestBody).toBeDefined();
    const schema = op?.requestBody?.content['application/json']?.schema;
    expect(Object.keys(schema?.properties ?? {})).toEqual(['name']);
    expect(op?.parameters).toEqual([
      { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
    ]);
  });

  it('documents the error envelope once, as a component', () => {
    const error = buildOpenApi().components.schemas.Error;
    expect(error).toMatchObject({ type: 'object', required: ['error'] });
  });
});

describe('GET /api/v1/openapi.json', () => {
  it('serves the document', async () => {
    const res = await openapiJson(new Request(`${APP_URL}/api/v1/openapi.json`));
    expect(res.status).toBe(200);
    const doc = (await res.json()) as { paths: Record<string, unknown> };
    expect(doc.paths['/api/v1/health']).toBeDefined();
    expect(doc.paths['/api/v1/onboarding']).toBeDefined();
  });

  it('imports every route file that documents itself, so none is missing from the document', () => {
    const apiDir = path.resolve('src/app/api');
    const index = readFileSync(path.join(apiDir, 'v1/openapi.json/route.ts'), 'utf8');

    const routeFiles: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const full = path.join(dir, name);
        if (statSync(full).isDirectory()) walk(full);
        else if (name === 'route.ts') routeFiles.push(full);
      }
    };
    walk(apiDir);

    const missing = routeFiles
      .filter((file) => /\bopenapi\s*:/.test(readFileSync(file, 'utf8')))
      .map((file) => {
        const rel = path.relative(path.resolve('src'), file).replaceAll(path.sep, '/');
        return `@/${rel.replace(/\.ts$/, '')}`;
      })
      .filter((spec) => !index.includes(`'${spec}'`));
    expect(missing).toEqual([]);
  });
});
