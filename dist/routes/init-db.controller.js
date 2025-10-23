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
exports.InitDbController = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const db_module_1 = require("../db/db.module");
let InitDbController = class InitDbController {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async initializeDatabase() {
        try {
            // Create tables directly
            await this.pool.query(`
        CREATE TABLE IF NOT EXISTS roles (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          name VARCHAR(100) UNIQUE NOT NULL,
          permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
            await this.pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          full_name VARCHAR(255),
          perm_version INT NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
            await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_roles (
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
          PRIMARY KEY (user_id, role_id)
        )
      `);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
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
        }
        catch (error) {
            return {
                success: false,
                error: error.message,
                stack: error.stack,
            };
        }
    }
};
exports.InitDbController = InitDbController;
__decorate([
    (0, common_1.Post)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], InitDbController.prototype, "initializeDatabase", null);
exports.InitDbController = InitDbController = __decorate([
    (0, common_1.Controller)('init-db'),
    __param(0, (0, common_1.Inject)(db_module_1.PG_POOL)),
    __metadata("design:paramtypes", [pg_1.Pool])
], InitDbController);
//# sourceMappingURL=init-db.controller.js.map