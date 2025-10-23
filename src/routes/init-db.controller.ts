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
      // Execute schema creation - split by semicolon and execute one by one
      const schemaPath = path.join(__dirname, '../../migrations/001_initial_schema.sql');
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      
      // Split SQL into individual statements
      const statements = schemaSql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      for (const stmt of statements) {
        if (stmt) {
          await this.pool.query(stmt);
        }
      }

      // Create role
      await this.pool.query(`
        INSERT INTO roles (name, permissions)
        VALUES ($1, $2)
        ON CONFLICT (name) DO NOTHING
      `, ['Admin', JSON.stringify({
        users: { view: true, create: true, edit: true, delete: true },
        messages: { view: true, send: true, delete: true },
        settings: { view: true, edit: true }
      })]);

      // Create user
      const userResult = await this.pool.query(`
        INSERT INTO users (email, password_hash, full_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) DO NOTHING
        RETURNING id
      `, ['admin@fastprepusa.com', 'test123', 'Admin User']);

      // Assign role
      if (userResult.rows.length > 0) {
        const userId = userResult.rows[0].id;
        const roleResult = await this.pool.query(`SELECT id FROM roles WHERE name = $1`, ['Admin']);
        if (roleResult.rows.length > 0) {
          const roleId = roleResult.rows[0].id;
          await this.pool.query(`
            INSERT INTO user_roles (user_id, role_id)
            VALUES ($1, $2)
            ON CONFLICT DO NOTHING
          `, [userId, roleId]);
        }
      }

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

