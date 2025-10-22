import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../db/db.module';

export interface EffectivePermissions {
  ver: number;
  permissions: string[];
  allowedChannels: string[];
}

@Injectable()
export class AuthzRepo {
  constructor(@Inject(PG_POOL) private pool: Pool) {}

  /**
   * Быстрый SELECT perm_version из users + CTE-вычисление EP:
   * - роли → permissions (JSONB массив)
   * - user_permission_overrides → добавляем/убираем
   * - user_channel_access → allowedChannels
   */
  async computeEP(userId: string): Promise<EffectivePermissions | null> {
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
    if (res.rows.length === 0) return null;

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
  async incrementPermVersion(userId: string): Promise<void> {
    await this.pool.query(
      `UPDATE users SET perm_version = perm_version + 1 WHERE id = $1`,
      [userId]
    );
  }
}

