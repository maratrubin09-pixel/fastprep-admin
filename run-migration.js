#!/usr/bin/env node
// Migration script using Node.js pg library
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL || process.argv[2];

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL is required');
  console.error('Usage: node run-migration.js <DATABASE_URL>');
  console.error('Or set DATABASE_URL environment variable');
  process.exit(1);
}

// Add port if not present in connection string
let connectionString = DATABASE_URL;
if (!connectionString.includes(':5432') && !connectionString.includes('@')) {
  // If connection string doesn't have port, try adding default port
  connectionString = connectionString.replace(/@([^\/]+)\//, '@$1:5432/');
}

// Render PostgreSQL requires SSL for external connections
const pool = new Pool({ 
  connectionString,
  ssl: {
    rejectUnauthorized: false // Render uses self-signed certificates
  }
});

async function runMigration() {
  try {
    console.log('🔄 Connecting to database...');
    const client = await pool.connect();
    
    console.log('📄 Reading migration file...');
    const sqlPath = path.join(__dirname, 'migrations', '004_email_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('🚀 Executing migration...');
    await client.query(sql);
    
    console.log('✅ Migration completed successfully!');
    
    client.release();
    await pool.end();
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  }
}

runMigration();

