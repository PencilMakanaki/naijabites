import { withTransaction } from '../db/pool.js';
import { ulid } from '../security/ids.js';
import { conflict, notFound } from '../http/errors.js';

const FIELDS = `
  public_id AS id,
  zone_name AS zoneName,
  state,
  city,
  area,
  fee_kobo AS feeKobo,
  status,
  created_at AS createdAt,
  updated_at AS updatedAt
`;

function mapZone(row) {
  if (!row) return null;

  return {
    ...row,
    feeKobo: Number(row.feeKobo),
  };
}

function handleDatabaseError(error) {
  if (error.code === 'ER_DUP_ENTRY') {
    throw conflict(
      'A delivery zone already exists for this state, city and area.',
      'delivery_zone_exists',
    );
  }

  throw error;
}

export function createDeliveryService({ pool }) {
  async function get(publicId) {
    const [rows] = await pool.execute(
      `SELECT ${FIELDS}
       FROM delivery_zones
       WHERE public_id = ?
       LIMIT 1`,
      [publicId],
    );

    return mapZone(rows[0]);
  }

  async function list({ includeInactive = true } = {}) {
    const [rows] = await pool.execute(
      `SELECT ${FIELDS}
       FROM delivery_zones
       ${includeInactive ? '' : "WHERE status = 'active'"}
       ORDER BY state, city, area, zone_name`,
    );

    return rows.map(mapZone);
  }

  async function writeAudit(conn, {
    userId,
    action,
    publicId,
    before,
    after,
    ip,
    userAgent,
  }) {
    await conn.execute(
      `INSERT INTO audit_log
       (actor_user_id, actor_role, action, entity_type, entity_id,
        before_json, after_json, ip, user_agent)
       VALUES (?, 'admin', ?, 'delivery_zone', ?, ?, ?, ?, ?)`,
      [
        userId,
        action,
        publicId,
        before ? JSON.stringify(before) : null,
        after ? JSON.stringify(after) : null,
        ip ?? null,
        userAgent ?? null,
      ],
    );
  }

  return {
    list,

        async quoteForAddress({ state, city, area }) {
      const [rows] = await pool.execute(
        `SELECT ${FIELDS}
         FROM delivery_zones
         WHERE status = 'active'
           AND state = ?
           AND city = ?
           AND (area = ? OR area = '')
         ORDER BY
           CASE WHEN area = ? THEN 0 ELSE 1 END,
           id DESC
         LIMIT 1`,
        [state, city, area, area],
      );

      return mapZone(rows[0]);
    },

    async create(userId, values, requestInfo = {}) {
      const publicId = ulid();

      try {
        await withTransaction(pool, async (conn) => {
          await conn.execute(
            `INSERT INTO delivery_zones
             (public_id, zone_name, state, city, area, fee_kobo,
              status, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
            [
              publicId,
              values.zoneName,
              values.state,
              values.city,
              values.area,
              values.feeKobo,
              userId,
              userId,
            ],
          );

          const after = {
            id: publicId,
            ...values,
            status: 'active',
          };

          await writeAudit(conn, {
            userId,
            action: 'delivery_zone.created',
            publicId,
            after,
            ...requestInfo,
          });
        });
      } catch (error) {
        handleDatabaseError(error);
      }

      return get(publicId);
    },

    async update(userId, publicId, values, requestInfo = {}) {
      try {
        await withTransaction(pool, async (conn) => {
          const [rows] = await conn.execute(
            `SELECT ${FIELDS}
             FROM delivery_zones
             WHERE public_id = ?
             FOR UPDATE`,
            [publicId],
          );

          const before = mapZone(rows[0]);

          if (!before) {
            throw notFound('Delivery zone not found.');
          }

          const columns = {
            zoneName: 'zone_name',
            state: 'state',
            city: 'city',
            area: 'area',
            feeKobo: 'fee_kobo',
          };

          const entries = Object.entries(values)
            .filter(([key]) => columns[key]);

          if (!entries.length) return;

          const set = entries
            .map(([key]) => `${columns[key]} = ?`)
            .join(', ');

          await conn.execute(
            `UPDATE delivery_zones
             SET ${set}, updated_by = ?
             WHERE public_id = ?`,
            [
              ...entries.map(([, value]) => value),
              userId,
              publicId,
            ],
          );

          const after = {
            ...before,
            ...values,
          };

          await writeAudit(conn, {
            userId,
            action: 'delivery_zone.updated',
            publicId,
            before,
            after,
            ...requestInfo,
          });
        });
      } catch (error) {
        handleDatabaseError(error);
      }

      return get(publicId);
    },

    async setStatus(userId, publicId, status, requestInfo = {}) {
      await withTransaction(pool, async (conn) => {
        const [rows] = await conn.execute(
          `SELECT ${FIELDS}
           FROM delivery_zones
           WHERE public_id = ?
           FOR UPDATE`,
          [publicId],
        );

        const before = mapZone(rows[0]);

        if (!before) {
          throw notFound('Delivery zone not found.');
        }

        if (before.status === status) return;

        await conn.execute(
          `UPDATE delivery_zones
           SET status = ?, updated_by = ?
           WHERE public_id = ?`,
          [status, userId, publicId],
        );

        const after = {
          ...before,
          status,
        };

        await writeAudit(conn, {
          userId,
          action: status === 'active'
            ? 'delivery_zone.activated'
            : 'delivery_zone.deactivated',
          publicId,
          before,
          after,
          ...requestInfo,
        });
      });

      return get(publicId);
    },
  };
}