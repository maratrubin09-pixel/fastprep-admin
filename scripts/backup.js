#!/usr/bin/env node

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Get DATABASE_URL from environment or argument
const DATABASE_URL = process.env.DATABASE_URL || process.argv[2];

if (!DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL is required');
  console.error('Usage: node scripts/backup.js [DATABASE_URL]');
  console.error('Or set DATABASE_URL environment variable');
  process.exit(1);
}

// Create backups directory if it doesn't exist
const BACKUP_DIR = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

// Generate backup filename
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5).replace('T', '_');
const version = '1.1.0';
const backupFile = path.join(BACKUP_DIR, `backup-v${version}-${timestamp}.sql`);

console.log('📦 Creating database backup...');
console.log(`📁 Backup file: ${backupFile}`);

// Create connection pool
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function backup() {
  let client;
  try {
    client = await pool.connect();
    
    // Get all table names
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);
    
    const tables = tablesResult.rows.map(row => row.table_name);
    
    // Start writing SQL file
    const writeStream = fs.createWriteStream(backupFile);
    
    // Write header
    writeStream.write(`-- FastPrep Admin Database Backup\n`);
    writeStream.write(`-- Version: ${version}\n`);
    writeStream.write(`-- Created: ${new Date().toISOString()}\n`);
    writeStream.write(`-- Database: ${new URL(DATABASE_URL).pathname.slice(1)}\n\n`);
    writeStream.write(`BEGIN;\n\n`);
    
    // Backup each table
    for (const table of tables) {
      console.log(`📋 Backing up table: ${table}`);
      
      // Get table structure
      const structureResult = await client.query(`
        SELECT 
          column_name,
          data_type,
          character_maximum_length,
          is_nullable,
          column_default
        FROM information_schema.columns
        WHERE table_schema = 'public' 
        AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);
      
      // Get data
      const dataResult = await client.query(`SELECT * FROM ${table}`);
      
      // Write CREATE TABLE statement (simplified)
      writeStream.write(`-- Table: ${table}\n`);
      writeStream.write(`DROP TABLE IF EXISTS ${table} CASCADE;\n`);
      writeStream.write(`CREATE TABLE ${table} (\n`);
      
      const columns = structureResult.rows.map((col, index, array) => {
        let colDef = `  ${col.column_name} ${col.data_type}`;
        if (col.character_maximum_length) {
          colDef += `(${col.character_maximum_length})`;
        }
        if (col.is_nullable === 'NO') {
          colDef += ' NOT NULL';
        }
        if (col.column_default) {
          colDef += ` DEFAULT ${col.column_default}`;
        }
        return colDef + (index < array.length - 1 ? ',' : '');
      }).join('\n');
      
      writeStream.write(columns);
      writeStream.write(`\n);\n\n`);
      
      // Write data
      if (dataResult.rows.length > 0) {
        writeStream.write(`INSERT INTO ${table} VALUES\n`);
        const values = dataResult.rows.map((row, rowIndex, rows) => {
          const vals = Object.values(row).map(val => {
            if (val === null) return 'NULL';
            if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`;
            if (val instanceof Date) return `'${val.toISOString()}'`;
            return val;
          }).join(', ');
          return `  (${vals})${rowIndex < rows.length - 1 ? ',' : ';'}`;
        }).join('\n');
        writeStream.write(values);
        writeStream.write(`\n\n`);
      }
    }
    
    writeStream.write(`COMMIT;\n`);
    writeStream.end();
    
    // Wait for stream to finish
    await new Promise((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });
    
    // Get file size
    const stats = fs.statSync(backupFile);
    const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
    
    console.log('✅ Backup created successfully!');
    console.log(`📊 Backup size: ${sizeMB} MB`);
    console.log(`📁 Location: ${backupFile}`);
    
  } catch (error) {
    console.error('❌ Backup failed!');
    console.error(`Error: ${error.message}`);
    if (fs.existsSync(backupFile)) {
      fs.unlinkSync(backupFile);
    }
    process.exit(1);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

backup();

