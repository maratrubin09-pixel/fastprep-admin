import { Controller, Post, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';
import * as fs from 'fs';
import * as path from 'path';

@Controller('init-db')
export class InitDbController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Post()
  async initializeDatabase() {
    try {
      // Read and execute initial schema
      const schemaPath = path.join(__dirname, '../../migrations/001_initial_schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      await this.pool.query(schemaSql);

      // Read and execute simple seed
      const seedPath = path.join(__dirname, '../../migrations/003_seed_simple.sql');
      const seedSql = fs.readFileSync(seedPath, 'utf8');
      await this.pool.query(seedSql);

      return {
        success: true,
        message: 'Database initialized successfully',
        credentials: {
          email: 'admin@fastprepusa.com',
          password: 'test123',
        },
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        stack: error.stack,
      };
    }
  }
}

