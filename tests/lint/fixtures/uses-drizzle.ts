import { sql } from 'drizzle-orm';
import { pgTable } from 'drizzle-orm/pg-core';

export const q = sql`select 1`;
export const t = pgTable;
