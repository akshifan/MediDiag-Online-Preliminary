const { pool } = require('./db');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
  let client;
  try {
    client = await pool.connect();
    console.log('📊 Connected to PostgreSQL database');

    // Read and execute schema
    const schemaPath = path.join(__dirname, 'schema.sql');
    if (!fs.existsSync(schemaPath)) {
      throw new Error('Schema file not found: ' + schemaPath);
    }

        const sql = fs.readFileSync(schemaPath, 'utf8');

    try {
      await client.query(sql);
      console.log('✅ Schema executed (all statements)');
    } catch (error) {
      const msg = String(error.message || '');
      const benign =
        msg.includes('already exists') ||
        msg.includes('duplicate key value') ||
        msg.includes('multiple primary keys');
      if (!benign) {
        console.error('❌ Schema error:', msg);
        throw error;
      }
      console.log('ℹ️  Some objects already existed — continuing.');
    }
    
    console.log('🎉 Database setup completed successfully');
  } catch (error) {
    console.error('❌ Error setting up database:', error.message);
    throw error;
  } finally {
    if (client) {
      client.release();
    }
    await pool.end();
  }
}

// Run if called directly
if (require.main === module) {
  setupDatabase().catch(console.error);
}

module.exports = setupDatabase;