"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthService = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const db_module_1 = require("../db/db.module");
let AuthService = class AuthService {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async login(email, password) {
        // Простая проверка: найти пользователя по email
        const result = await this.pool.query(`SELECT u.id, u.email, u.full_name, u.password_hash, r.name as role_name, r.permissions
       FROM users u
       LEFT JOIN user_roles ur ON u.id = ur.user_id
       LEFT JOIN roles r ON ur.role_id = r.id
       WHERE u.email = $1`, [email]);
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
    async getMe(token) {
        try {
            const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
            const result = await this.pool.query(`SELECT u.id, u.email, u.full_name, r.name as role_name, r.permissions
         FROM users u
         LEFT JOIN user_roles ur ON u.id = ur.user_id
         LEFT JOIN roles r ON ur.role_id = r.id
         WHERE u.id = $1`, [decoded.userId]);
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
        }
        catch (err) {
            throw new Error('Invalid token');
        }
    }
    async updateProfile(token, data) {
        try {
            const decoded = JSON.parse(Buffer.from(token, 'base64').toString());
            const userId = decoded.userId;
            // If changing password, verify current password
            if (data.newPassword) {
                if (!data.currentPassword) {
                    throw new Error('Current password is required');
                }
                const userCheck = await this.pool.query(`SELECT password_hash FROM users WHERE id = $1`, [userId]);
                if (userCheck.rows.length === 0) {
                    throw new Error('User not found');
                }
                // MVP: Simple password check (NOT FOR PRODUCTION!)
                if (userCheck.rows[0].password_hash !== data.currentPassword) {
                    throw new Error('Current password is incorrect');
                }
            }
            // Build update query
            const fields = [];
            const values = [];
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
            const result = await this.pool.query(`UPDATE users
         SET ${fields.join(', ')}
         WHERE id = $${paramCount}
         RETURNING id, email, full_name as name`, values);
            return result.rows[0];
        }
        catch (err) {
            throw new Error(err.message || 'Failed to update profile');
        }
    }
};
exports.AuthService = AuthService;
exports.AuthService = AuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(db_module_1.PG_POOL)),
    __metadata("design:paramtypes", [pg_1.Pool])
], AuthService);
//# sourceMappingURL=auth.service.js.map