import { withTransaction } from "../db/pool.js";
import { ulid } from "../security/ids.js";
import { notFound } from "../http/errors.js";


const FIELDS = `public_id AS id, recipient_name AS recipientName, phone,
  address_line1 AS addressLine1, address_line2 AS addressLine2, area, city, state,
  landmark, latitude, longitude,
  delivery_instructions AS deliveryInstructions,
  is_default AS isDefault,
  created_at AS createdAt, updated_at AS updatedAt`;

export function createAddressService({ pool }) {
  async function list(userId) {
    const [rows] = await pool.execute(
      `SELECT ${FIELDS}
       FROM customer_addresses
       WHERE user_id = ?
       ORDER BY is_default DESC, id DESC`,
      [userId],
    );

    return rows.map((row) => ({
      ...row,
      isDefault: Boolean(row.isDefault),
    }));
  }

  return {
    list,

    async create(userId, values) {
      const publicId = ulid();

      await withTransaction(pool, async (conn) => {
        await conn.execute(
          'SELECT id FROM users WHERE id = ? FOR UPDATE',
          [userId],
        );

        const [[count]] = await conn.execute(
          'SELECT COUNT(*) AS total FROM customer_addresses WHERE user_id = ?',
          [userId],
        );

        const makeDefault =
          values.isDefault === true || Number(count.total) === 0;

        if (makeDefault) {
          await conn.execute(
            'UPDATE customer_addresses SET is_default = 0 WHERE user_id = ?',
            [userId],
          );
        }

        await conn.execute(
          `INSERT INTO customer_addresses
           (public_id, user_id, recipient_name, phone, address_line1,
            address_line2, area, city, state, landmark, latitude, longitude,
            delivery_instructions, is_default)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            publicId,
            userId,
            values.recipientName,
            values.phone,
            values.addressLine1,
            values.addressLine2 ?? null,
            values.area,
            values.city,
            values.state,
            values.landmark ?? null,
            values.latitude ?? null,
            values.longitude ?? null,
            values.deliveryInstructions ?? null,
            makeDefault ? 1 : 0,
          ],
        );
      });

      return (await list(userId)).find(
        (address) => address.id === publicId,
      );
    },

    async update(userId, publicId, values) {
      await withTransaction(pool, async (conn) => {
        await conn.execute(
          'SELECT id FROM users WHERE id = ? FOR UPDATE',
          [userId],
        );

        const [[found]] = await conn.execute(
          `SELECT id, is_default
           FROM customer_addresses
           WHERE user_id = ? AND public_id = ?
           FOR UPDATE`,
          [userId, publicId],
        );

        if (!found) {
          throw notFound('Delivery address not found.');
        }

        if (values.isDefault === true) {
          await conn.execute(
            'UPDATE customer_addresses SET is_default = 0 WHERE user_id = ?',
            [userId],
          );
        }

        const columns = {
          recipientName: 'recipient_name',
          phone: 'phone',
          addressLine1: 'address_line1',
          addressLine2: 'address_line2',
          area: 'area',
          city: 'city',
          state: 'state',
          landmark: 'landmark',
          latitude: 'latitude',
          longitude: 'longitude',
          deliveryInstructions: 'delivery_instructions',
          isDefault: 'is_default',
        };

        const entries = Object.entries(values).filter(
          ([key, value]) =>
            columns[key] &&
            !(key === 'isDefault' && value === false && Boolean(found.is_default)),
        );

        if (entries.length > 0) {
          const set = entries
            .map(([key]) => `${columns[key]} = ?`)
            .join(', ');

          const params = entries.map(([key, value]) =>
            key === 'isDefault' ? (value ? 1 : 0) : value,
          );

          await conn.execute(
            `UPDATE customer_addresses
             SET ${set}
             WHERE id = ? AND user_id = ?`,
            [...params, found.id, userId],
          );
        }
      });

      return (await list(userId)).find(
        (address) => address.id === publicId,
      );
    },

    async remove(userId, publicId) {
      await withTransaction(pool, async (conn) => {
        await conn.execute(
          'SELECT id FROM users WHERE id = ? FOR UPDATE',
          [userId],
        );

        const [[found]] = await conn.execute(
          `SELECT id, is_default
           FROM customer_addresses
           WHERE user_id = ? AND public_id = ?
           FOR UPDATE`,
          [userId, publicId],
        );

        if (!found) {
          throw notFound('Delivery address not found.');
        }

        await conn.execute(
          'DELETE FROM customer_addresses WHERE id = ? AND user_id = ?',
          [found.id, userId],
        );

        if (found.is_default) {
          const [[next]] = await conn.execute(
            `SELECT id
             FROM customer_addresses
             WHERE user_id = ?
             ORDER BY id DESC
             LIMIT 1
             FOR UPDATE`,
            [userId],
          );

          if (next) {
            await conn.execute(
              'UPDATE customer_addresses SET is_default = 1 WHERE id = ?',
              [next.id],
            );
          }
        }
      });

      return { status: 'deleted' };
    },

    async setDefault(userId, publicId) {
      await withTransaction(pool, async (conn) => {
        await conn.execute(
          'SELECT id FROM users WHERE id = ? FOR UPDATE',
          [userId],
        );

        const [[found]] = await conn.execute(
          `SELECT id
           FROM customer_addresses
           WHERE user_id = ? AND public_id = ?
           FOR UPDATE`,
          [userId, publicId],
        );

        if (!found) {
          throw notFound('Delivery address not found.');
        }

        await conn.execute(
          'UPDATE customer_addresses SET is_default = 0 WHERE user_id = ?',
          [userId],
        );

        await conn.execute(
          'UPDATE customer_addresses SET is_default = 1 WHERE id = ? AND user_id = ?',
          [found.id, userId],
        );
      });

      return (await list(userId)).find(
        (address) => address.id === publicId,
      );
    },
  };
}