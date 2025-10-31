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
const public_decorator_1 = require("../auth/public.decorator");
let InitDbController = class InitDbController {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async migrateDatabase() {
        try {
            // Добавить колонки в outbox (если еще не добавлены)
            await this.pool.query(`
        ALTER TABLE outbox ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
      `);
            await this.pool.query(`
        ALTER TABLE outbox ADD COLUMN IF NOT EXISTS attempts INT NOT NULL DEFAULT 0;
      `);
            // Добавить колонки в conversations для имен чатов
            await this.pool.query(`
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS chat_title VARCHAR(500);
      `);
            await this.pool.query(`
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS chat_type VARCHAR(50);
      `);
            await this.pool.query(`
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS participant_count INT;
      `);
            await this.pool.query(`
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS telegram_peer_id TEXT;
      `);
            // Добавить колонки для контактных данных (номер телефона, имя, username)
            await this.pool.query(`
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sender_phone VARCHAR(50);
      `);
            await this.pool.query(`
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sender_username VARCHAR(255);
      `);
            await this.pool.query(`
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sender_first_name VARCHAR(255);
      `);
            await this.pool.query(`
        ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sender_last_name VARCHAR(255);
      `);
            // Добавить колонки в messages (если нужны)
            await this.pool.query(`
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS sender_id UUID REFERENCES users(id) ON DELETE SET NULL;
      `);
            await this.pool.query(`
        ALTER TABLE messages ADD COLUMN IF NOT EXISTS object_key VARCHAR(500);
      `);
            // Добавить оптимизированные индексы
            await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at 
        ON conversations (last_message_at DESC NULLS LAST);
      `);
            await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_messages_conversation_id_created_at 
        ON messages (conversation_id, created_at DESC);
      `);
            await this.pool.query(`
        CREATE INDEX IF NOT EXISTS idx_outbox_status_scheduled_at
        ON outbox (status, scheduled_at ASC);
      `);
            return {
                success: true,
                message: 'Migration completed: added columns and indexes for Phase 1'
            };
        }
        catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
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
            // Create messenger_connections table
            await this.pool.query(`
        CREATE TABLE IF NOT EXISTS messenger_connections (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          platform VARCHAR(50) NOT NULL,
          status VARCHAR(20) NOT NULL DEFAULT 'disconnected',
          connection_data JSONB DEFAULT '{}'::jsonb,
          connected_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_id, platform)
        )
      `);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_messenger_connections_user_id ON messenger_connections(user_id)`);
            // Create conversations table
            await this.pool.query(`
        CREATE TABLE IF NOT EXISTS conversations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          channel_id VARCHAR(255) UNIQUE NOT NULL,
          external_chat_id VARCHAR(255),
          status VARCHAR(20) NOT NULL DEFAULT 'open',
          assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
          last_message_at TIMESTAMPTZ,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_channel_id ON conversations(channel_id)`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status)`);
            // Create messages table
            await this.pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          direction VARCHAR(10) NOT NULL CHECK (direction IN ('in', 'out')),
          text TEXT,
          external_message_id VARCHAR(255),
          sender_name VARCHAR(255),
          delivery_status VARCHAR(20),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_messages_external_message_id ON messages(external_message_id)`);
            // Create outbox table
            await this.pool.query(`
        CREATE TABLE IF NOT EXISTS outbox (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
          message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
          status VARCHAR(20) NOT NULL DEFAULT 'pending',
          scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          attempts INT NOT NULL DEFAULT 0,
          retry_count INT NOT NULL DEFAULT 0,
          last_error TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_outbox_status ON outbox(status)`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_outbox_created_at ON outbox(created_at)`);
            // Create user_permission_overrides table (for AuthzRepo)
            await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_permission_overrides (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          permission VARCHAR(255) NOT NULL,
          action VARCHAR(10) NOT NULL CHECK (action IN ('grant', 'revoke')),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_user_permission_overrides_user_id ON user_permission_overrides(user_id)`);
            // Create user_channel_access table (for AuthzRepo)
            await this.pool.query(`
        CREATE TABLE IF NOT EXISTS user_channel_access (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          channel_id VARCHAR(255) NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_id, channel_id)
        )
      `);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_user_channel_access_user_id ON user_channel_access(user_id)`);
            // Create audit_logs table
            await this.pool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          action VARCHAR(255) NOT NULL,
          resource_type VARCHAR(100),
          resource_id VARCHAR(255),
          details JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id)`);
            await this.pool.query(`CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at)`);
            // Create role with permissions as array of strings
            await this.pool.query(`
        INSERT INTO roles (name, permissions)
        VALUES ($1, $2)
        ON CONFLICT (name) DO UPDATE SET permissions = EXCLUDED.permissions
      `, ['Admin', JSON.stringify([
                    'users.view',
                    'users.create',
                    'users.edit',
                    'users.delete',
                    'messages.view',
                    'messages.send',
                    'messages.delete',
                    'settings.view',
                    'settings.edit',
                    'inbox.view',
                    'inbox.send_message'
                ])]);
            // Create user
            const userResult = await this.pool.query(`
        INSERT INTO users (email, password_hash, full_name)
        VALUES ($1, $2, $3)
        ON CONFLICT (email) DO NOTHING
        RETURNING id
      `, ['marat@fastprepusa.com', 'test123', 'Marat Rubin']);
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
                    email: 'marat@fastprepusa.com',
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
    (0, public_decorator_1.Public)() // Миграция для добавления колонок и индексов
    ,
    (0, common_1.Post)('migrate'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], InitDbController.prototype, "migrateDatabase", null);
__decorate([
    (0, public_decorator_1.Public)() // Публичный endpoint для инициализации БД
    ,
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