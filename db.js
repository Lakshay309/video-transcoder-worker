import dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

// Prevent crash on idle disconnect
pool.on("error", (err) => {
  console.error("Unexpected PG Pool Error:", err);
});

export async function updateVideo(s3Key, playlistUrl) {
  await pool.query(
    `
    UPDATE videos
    SET status = 'READY',
        master_playlist_url = $1
    WHERE key = $2
    `,
    [playlistUrl, s3Key]
  );
}