import { Controller, Post, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';

@Controller('update-admin-email')
export class UpdateAdminEmailController {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  @Post()
  async updateAdminEmail() {
    try {
      // Update existing admin user email
      const result = await this.pool.query(`
        UPDATE users
        SET email = $1, full_name = $2, updated_at = NOW()
        WHERE email = $3
        RETURNING id, email, full_name
      `, ['marat@fastprepusa.com', 'Marat Rubin', 'admin@fastprepusa.com']);

      if (result.rows.length === 0) {
        return {
          success: false,
          message: 'Admin user not found. Creating new user...',
        };
      }

      return {
        success: true,
        message: 'Admin email updated successfully',
        user: result.rows[0],
        newCredentials: {
          email: 'marat@fastprepusa.com',
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






