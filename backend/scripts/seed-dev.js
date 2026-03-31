import { randomUUID } from "node:crypto";
import pg from "pg";

const { Pool } = pg;

const databaseUrl = String(process.env.DATABASE_URL || "").trim();
if (!databaseUrl) {
  throw new Error("DATABASE_URL_REQUIRED");
}

const pool = new Pool({ connectionString: databaseUrl });
const client = await pool.connect();

const tenantDefaultId = randomUUID();
const tenantKilikuruId = randomUUID();
const userOwnerId = randomUUID();
const userEditorId = randomUUID();

try {
  await client.query("BEGIN");

  await client.query(
    `INSERT INTO bridge.users (id, external_subject, email, display_name)
     VALUES ($1, $2, $3, $4), ($5, $6, $7, $8)
     ON CONFLICT (external_subject) DO NOTHING`,
    [
      userOwnerId,
      "u_owner",
      "owner@example.com",
      "Owner",
      userEditorId,
      "u_editor",
      "editor@example.com",
      "Editor"
    ]
  );

  await client.query(
    `INSERT INTO bridge.tenants (id, slug, name, plan_tier)
     VALUES ($1, 'default-store', 'Default Store', 'starter'),
            ($2, 'kilikuru2k7', 'kilikuru2k7', 'growth')
     ON CONFLICT (slug) DO NOTHING`,
    [tenantDefaultId, tenantKilikuruId]
  );

  await client.query(
    `INSERT INTO bridge.tenant_memberships (id, tenant_id, user_id, role)
     SELECT gen_random_uuid(), t.id, u.id, x.role
     FROM (VALUES
       ('default-store', 'u_owner', 'owner'),
       ('kilikuru2k7', 'u_owner', 'owner'),
       ('kilikuru2k7', 'u_editor', 'editor')
     ) AS x(slug, subject, role)
     JOIN bridge.tenants t ON t.slug = x.slug
     JOIN bridge.users u ON u.external_subject = x.subject
      ON CONFLICT (tenant_id, user_id) DO NOTHING`
  );

  await client.query(
    `INSERT INTO bridge.user_credentials (user_id, password_hash)
     SELECT u.id, encode(digest(x.password, 'sha256'), 'hex')
     FROM (VALUES
       ('u_owner', '123456'),
       ('u_editor', '123456')
     ) AS x(subject, password)
     JOIN bridge.users u ON u.external_subject = x.subject
     ON CONFLICT (user_id) DO NOTHING`
  );

  await client.query(
    `INSERT INTO tenant_domain.posts (id, tenant_id, type, status, title)
     SELECT gen_random_uuid(), t.id, 'feed', 'draft', CASE WHEN t.slug = 'default-store'
       THEN 'Default Store first feed' ELSE 'Kilikuru Friday campaign' END
     FROM bridge.tenants t
     WHERE t.slug IN ('default-store', 'kilikuru2k7')`
  );

  await client.query("COMMIT");
  console.log("Seed completed.");
} catch (error) {
  await client.query("ROLLBACK");
  throw error;
} finally {
  client.release();
  await pool.end();
}
