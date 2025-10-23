"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
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
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
let InitDbController = class InitDbController {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
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