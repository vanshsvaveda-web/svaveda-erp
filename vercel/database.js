import pg from 'pg';
import supabaseCA from './supabase-ca.js';

let pool;

function databasePool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing');
  if (pool) return pool;
  const url = new URL(process.env.DATABASE_URL);
  url.searchParams.delete('sslmode');
  return pool = new pg.Pool({
    connectionString: url.toString(),
    ssl: { ca: supabaseCA, rejectUnauthorized: true },
    max: 2,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000
  });
}

function adapter(executor) { return {
  prepare(statement) {
    let index = 0;
    const query = statement
      .replace("json_extract(payload, '$.orgKey')", "(payload::jsonb ->> 'orgKey')")
      .replace('COUNT(*) AS count', 'COUNT(*)::integer AS count')
      .replace(/\?/g, () => '$' + ++index);
    return {
      bind(...parameters) {
        const execute = async () => {
          const result = await executor().query(query, parameters);
          for (const row of result.rows) if (typeof row.created === 'string') row.created = Number(row.created);
          return result;
        };
        return {
          first: async () => (await execute()).rows[0],
          all: async () => ({ results: (await execute()).rows }),
          run: async () => ({ meta: { changes: (await execute()).rowCount } })
        };
      }
    };
  }
}; }

export const database = adapter(databasePool);

export async function withSheetWriteLock(callback) {
  const client=await databasePool().connect();
  try {
    await client.query('BEGIN');
    const {rows:[{locked}]}=await client.query('SELECT pg_try_advisory_xact_lock(734211902) AS locked');
    if(!locked){
      await client.query('ROLLBACK');
      return Response.json({error:'Another Sheet write is in progress. Retry shortly.'},{status:409});
    }
    const response=await callback(adapter(()=>client));
    await client.query('COMMIT');
    return response;
  }catch(error){
    await client.query('ROLLBACK');
    throw error;
  }finally{
    client.release();
  }
}
