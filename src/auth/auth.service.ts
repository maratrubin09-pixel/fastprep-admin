import { Injectable, Inject, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private jwtService: JwtService
  ) {}

  async login(email: string, password: string): Promise<any> {
    // Найти пользователя по email
    const result = await this.pool.query(
      `SELECT u.id, u.email, u.full_name, u.password_hash, r.name as role_name, r.permissions
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const user = result.rows[0];

    // Проверка пароля
    // Для обратной совместимости: если пароль не хеширован (старые пользователи), проверяем напрямую
    let isPasswordValid = false;
    if (user.password_hash.startsWith('$2')) {
      // Хешированный пароль (bcrypt)
      isPasswordValid = await bcrypt.compare(password, user.password_hash);
    } else {
      // Простой пароль (для теста)
      isPasswordValid = user.password_hash === password;
    }

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Генерируем JWT токен
    const payload = { sub: user.id, email: user.email };
    const token = this.jwtService.sign(payload);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.full_name,
        role: user.role_name,
        permissions: user.permissions,
      },
    };
  }

  async getMe(userId: string): Promise<any> {
    const result = await this.pool.query(
      `SELECT u.id, u.email, u.full_name, r.name as role_name, r.permissions
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      throw new UnauthorizedException('User not found');
    }

    const user = result.rows[0];
    return {
      id: user.id,
      email: user.email,
      name: user.full_name,
      role: user.role_name,
      permissions: user.permissions,
    };
  }

  async updateProfile(
    userId: string,
    data: { name?: string; email?: string; currentPassword?: string; newPassword?: string }
  ): Promise<any> {
    try {

      // If changing password, verify current password
      if (data.newPassword) {
        if (!data.currentPassword) {
          throw new Error('Current password is required');
        }

        const userCheck = await this.pool.query(
          `SELECT password_hash FROM users WHERE id = $1`,
          [userId]
        );

        if (userCheck.rows.length === 0) {
          throw new Error('User not found');
        }

        // MVP: Simple password check (NOT FOR PRODUCTION!)
        if (userCheck.rows[0].password_hash !== data.currentPassword) {
          throw new Error('Current password is incorrect');
        }
      }

      // Build update query
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
      if (data.newPassword) {
        fields.push(`password_hash = $${paramCount++}`);
        values.push(data.newPassword);
      }

      fields.push(`updated_at = NOW()`);
      values.push(userId);

      const result = await this.pool.query(
        `UPDATE users
         SET ${fields.join(', ')}
         WHERE id = $${paramCount}
         RETURNING id, email, full_name as name`,
        values
      );

      return result.rows[0];
    } catch (err: any) {
      throw new Error(err.message || 'Failed to update profile');
    }
  }
}



