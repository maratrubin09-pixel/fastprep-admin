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
exports.AuthzRepo = void 0;
const common_1 = require("@nestjs/common");
const pg_1 = require("pg");
const db_module_1 = require("../db/db.module");
let AuthzRepo = class AuthzRepo {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    /**
     * Быстрый SELECT perm_version из users + CTE-вычисление EP:
     * - роли → permissions (JSONB массив)
     * - user_permission_overrides → добавляем/убираем
     * - user_channel_access → allowedChannels
     */
    async computeEP(userId) {
        const sql = `
      WITH role_perms AS (
        SELECT COALESCE(jsonb_agg(DISTINCT p), '[]'::jsonb) AS perms
        FROM users u
        JOIN user_roles ur ON ur.user_id = u.id
        JOIN roles r ON r.id = ur.role_id
        CROSS JOIN LATERAL jsonb_array_elements_text(r.permissions) p
        WHERE u.id = $1
      ),
      override_perms AS (
        SELECT
          COALESCE(jsonb_agg(DISTINCT permission) FILTER (WHERE action = 'grant'), '[]'::jsonb) AS grants,
          COALESCE(jsonb_agg(DISTINCT permission) FILTER (WHERE action = 'revoke'), '[]'::jsonb) AS revokes
        FROM user_permission_overrides
        WHERE user_id = $1
      ),
      final_perms AS (
        SELECT (
          SELECT jsonb_agg(DISTINCT p)
          FROM (
            SELECT p FROM role_perms, jsonb_array_elements_text(role_perms.perms) p
            UNION
            SELECT g FROM override_perms, jsonb_array_elements_text(override_perms.grants) g
          ) combined
          WHERE p NOT IN (SELECT r FROM override_perms, jsonb_array_elements_text(override_perms.revokes) r)
        ) AS perms
      ),
      channels AS (
        SELECT COALESCE(jsonb_agg(DISTINCT channel_id), '[]'::jsonb) AS allowed
        FROM user_channel_access
        WHERE user_id = $1
      )
      SELECT
        u.perm_version AS ver,
        COALESCE(fp.perms, '[]'::jsonb) AS permissions,
        COALESCE(ch.allowed, '[]'::jsonb) AS allowed_channels
      FROM users u
      CROSS JOIN final_perms fp
      CROSS JOIN channels ch
      WHERE u.id = $1
    `;
        const res = await this.pool.query(sql, [userId]);
        if (res.rows.length === 0)
            return null;
        const row = res.rows[0];
        return {
            ver: Number(row.ver),
            permissions: row.permissions || [],
            allowedChannels: row.allowed_channels || [],
        };
    }
    /**
     * Инвалидация: perm_version++ для userId
     */
    async incrementPermVersion(userId) {
        await this.pool.query(`UPDATE users SET perm_version = perm_version + 1 WHERE id = $1`, [userId]);
    }
};
exports.AuthzRepo = AuthzRepo;
exports.AuthzRepo = AuthzRepo = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Inject)(db_module_1.PG_POOL)),
    __metadata("design:paramtypes", [pg_1.Pool])
], AuthzRepo);
//# sourceMappingURL=authz.repo.js.map