import { Injectable } from '@nestjs/common';
import { Pool } from 'pg';

@Injectable()
export class AuthService {
  constructor(private readonly pool: Pool) {}

  async login(email: string, password: string): Promise<any> {
    // Простая проверка: найти пользователя по email
    const result = await this.pool.query(
      `SELECT u.id, u.email, u.full_name, u.password_hash, r.name as role_name, r.permissions
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.email = $1`,
      [email]
    );

    if (result.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = result.rows[0];

    // MVP: Простая проверка пароля (для теста, НЕ ДЛЯ PRODUCTION!)
    if (user.password_hash !== password) {
      throw new Error('Invalid password');
    }

    // Генерируем простой JWT (или просто возвращаем токен-заглушку)
    const token = Buffer.from(JSON.stringify({ userId: user.id, email: user.email })).toString('base64');

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

  async getMe(token: string): Promise<any> {
    try {
      const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
      const result = await this.pool.query(
        `SELECT u.id, u.email, u.full_name, r.name as role_name, r.permissions
         FROM users u
         LEFT JOIN user_roles ur ON u.id = ur.user_id
         LEFT JOIN roles r ON ur.role_id = r.id
         WHERE u.id = $1`,
        [decoded.userId]
      );

      if (result.rows.length === 0) {
        throw new Error('User not found');
      }

      const user = result.rows[0];
      return {
        id: user.id,
        email: user.email,
        name: user.full_name,
        role: user.role_name,
        permissions: user.permissions,
      };
    } catch (err) {
      throw new Error('Invalid token');
    }
  }
}

