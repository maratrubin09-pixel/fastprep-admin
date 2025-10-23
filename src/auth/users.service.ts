import { Injectable, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';

@Injectable()
export class UsersService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async getAllUsers() {
    const result = await this.pool.query(`
      SELECT u.id, u.email, u.full_name as name, u.created_at, r.name as role
      FROM users u
      LEFT JOIN user_roles ur ON u.id = ur.user_id
      LEFT JOIN roles r ON ur.role_id = r.id
      ORDER BY u.created_at DESC
    `);
    return result.rows;
  }

  async createUser(data: { name: string; email: string; password: string; role?: string }) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create user
      const userResult = await client.query(`
        INSERT INTO users (email, password_hash, full_name)
        VALUES ($1, $2, $3)
        RETURNING id, email, full_name as name, created_at
      `, [data.email, data.password, data.name]);

      const user = userResult.rows[0];

      // Assign role
      if (data.role) {
        const roleResult = await client.query(`
          SELECT id FROM roles WHERE name = $1
        `, [data.role]);

        if (roleResult.rows.length > 0) {
          await client.query(`
            INSERT INTO user_roles (user_id, role_id)
            VALUES ($1, $2)
          `, [user.id, roleResult.rows[0].id]);
          user.role = data.role;
        }
      }

      await client.query('COMMIT');
      return user;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async updateUser(userId: string, data: { name?: string; email?: string; password?: string; role?: string }) {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Update user
      const fields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (data.name) {
        fields.push(`full_name = $${paramCount++}`);
        values.push(data.name);
      }
      if (data.email) {
        fields.push(`email = $${paramCount++}`);
        values.push(data.email);
      }
      if (data.password) {
        fields.push(`password_hash = $${paramCount++}`);
        values.push(data.password);
      }

      fields.push(`updated_at = NOW()`);
      values.push(userId);

      const userResult = await client.query(`
        UPDATE users
        SET ${fields.join(', ')}
        WHERE id = $${paramCount}
        RETURNING id, email, full_name as name, updated_at
      `, values);

      const user = userResult.rows[0];

      // Update role if provided
      if (data.role) {
        await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [userId]);
        
        const roleResult = await client.query(`
          SELECT id FROM roles WHERE name = $1
        `, [data.role]);

        if (roleResult.rows.length > 0) {
          await client.query(`
            INSERT INTO user_roles (user_id, role_id)
            VALUES ($1, $2)
          `, [userId, roleResult.rows[0].id]);
          user.role = data.role;
        }
      }

      await client.query('COMMIT');
      return user;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async deleteUser(userId: string) {
    await this.pool.query(`DELETE FROM users WHERE id = $1`, [userId]);
  }
}

