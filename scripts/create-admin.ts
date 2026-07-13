import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { Client } from 'pg';
import { databaseConfig } from '../src/config/database/database.config';

async function main() {
  const username = process.env.ADMIN_BOOTSTRAP_USERNAME?.trim();
  const email = process.env.ADMIN_BOOTSTRAP_EMAIL?.trim();
  const displayName = process.env.ADMIN_BOOTSTRAP_DISPLAY_NAME?.trim();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD;

  if (!username || !email || !displayName || !password) {
    throw new Error(
      'ADMIN_BOOTSTRAP_USERNAME, ADMIN_BOOTSTRAP_EMAIL, ADMIN_BOOTSTRAP_DISPLAY_NAME and ADMIN_BOOTSTRAP_PASSWORD are required',
    );
  }
  if (password.length < 12) {
    throw new Error('ADMIN_BOOTSTRAP_PASSWORD must contain at least 12 characters');
  }

  const config = databaseConfig() as ReturnType<typeof databaseConfig> & {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  const client = new Client({
    host: config.host as string,
    port: config.port as number,
    user: config.username as string,
    password: config.password as string,
    database: config.database as string,
  });

  await client.connect();
  try {
    await client.query('BEGIN');
    const passwordHash = await bcrypt.hash(password, 12);
    const inserted = await client.query(
      `INSERT INTO admin_users
        (username, email, display_name, password_hash, password_changed_at)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       RETURNING id`,
      [username, email, displayName, passwordHash],
    );
    await client.query(
      `INSERT INTO admin_user_roles (user_id, role_id)
       SELECT $1, id FROM admin_roles WHERE code = 'super_admin'`,
      [inserted.rows[0].id],
    );
    await client.query('COMMIT');
    console.log(`Admin user created: ${username}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
