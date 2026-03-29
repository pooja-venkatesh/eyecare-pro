require('dotenv').config();
const mysql = require('mysql2/promise');

async function fixDatabase() {
    const conn = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || 'daisy15',
        database: process.env.DB_NAME || 'eyecare_pro',
        connectTimeout: 10000
    });

    console.log('=== Fixing users table column names ===\n');

    const [cols] = await conn.query('DESCRIBE users');
    const colNames = cols.map(c => c.Field);
    console.log('Current columns:', colNames.join(', '));

    // Step 1: Rename full_name -> name
    if (colNames.includes('full_name') && !colNames.includes('name')) {
        await conn.query('ALTER TABLE users CHANGE `full_name` `name` VARCHAR(100) NOT NULL');
        console.log('✅ Renamed full_name → name');
    } else {
        console.log('ℹ️  name column already correct');
    }

    // Step 2: Rename password_hash -> password
    if (colNames.includes('password_hash') && !colNames.includes('password')) {
        await conn.query('ALTER TABLE users CHANGE `password_hash` `password` VARCHAR(255) NOT NULL');
        console.log('✅ Renamed password_hash → password');
    } else {
        console.log('ℹ️  password column already correct');
    }

    // Step 3: Add health_score if missing
    if (!colNames.includes('health_score')) {
        await conn.query('ALTER TABLE users ADD COLUMN `health_score` INT DEFAULT 85');
        console.log('✅ Added health_score column');
    }

    // Step 4: Add break_streak if missing
    if (!colNames.includes('break_streak')) {
        await conn.query('ALTER TABLE users ADD COLUMN `break_streak` INT DEFAULT 0');
        console.log('✅ Added break_streak column');
    }

    // Step 5: Verify with a test insert
    console.log('\n--- Testing registration INSERT ---');
    try {
        const bcrypt = require('bcryptjs');
        const hash = await bcrypt.hash('testpass123', 12);
        const testEmail = `test_${Date.now()}@diagnose.com`;
        await conn.query(
            'INSERT INTO users (name, email, password) VALUES (?, ?, ?)',
            ['Test User', testEmail, hash]
        );
        await conn.query('DELETE FROM users WHERE email = ?', [testEmail]);
        console.log('✅ Registration INSERT works perfectly!');
    } catch (e) {
        console.error('❌ Insert still failing:', e.message);
    }

    await conn.end();
    console.log('\n✅ Fix complete! Now:');
    console.log('   1. Restart server: node server.js');
    console.log('   2. Go to http://localhost:3001/login.html');
    console.log('   3. Click "Create Account" and register');
}

fixDatabase().catch(e => {
    console.error('Script error:', e.message);
    process.exit(1);
});
