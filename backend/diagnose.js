require('dotenv').config();
const mysql = require('mysql2/promise');

async function diagnose() {
    console.log('=== EyeCare Pro Diagnostics ===');
    console.log('DB_HOST:', process.env.DB_HOST || 'localhost');
    console.log('DB_USER:', process.env.DB_USER || 'root');
    console.log('DB_NAME:', process.env.DB_NAME || 'eyecare_pro');
    console.log('DB_PASSWORD length:', (process.env.DB_PASSWORD || 'daisy15').length);
    console.log('');

    // Test 1: Connect WITHOUT specifying database
    console.log('[1] Connecting to MySQL (no database)...');
    let conn;
    try {
        conn = await mysql.createConnection({
            host: process.env.DB_HOST || 'localhost',
            user: process.env.DB_USER || 'root',
            password: process.env.DB_PASSWORD || 'daisy15',
            connectTimeout: 10000
        });
        console.log('✅ MySQL connection successful!');
    } catch (e) {
        console.error('❌ MySQL connection FAILED:', e.message, '(code:', e.code + ')');
        console.log('\n>>> FIX: Start the MySQL service in Services or XAMPP/WAMP control panel.');
        process.exit(1);
    }

    // Test 2: Check if database exists
    console.log('[2] Checking if `eyecare_pro` database exists...');
    const [dbs] = await conn.query("SHOW DATABASES LIKE 'eyecare_pro'");
    if (dbs.length === 0) {
        console.error('❌ Database `eyecare_pro` does NOT exist!');
        console.log('>>> FIX: Run the schema.sql file in MySQL Workbench.');
        process.exit(1);
    }
    console.log('✅ Database `eyecare_pro` exists!');

    // Test 3: Use the database and check for tables
    console.log('[3] Checking tables...');
    await conn.query('USE eyecare_pro');
    const [tables] = await conn.query("SHOW TABLES");
    console.log('Tables found:', tables.map(t => Object.values(t)[0]));

    if (tables.length === 0) {
        console.error('❌ No tables found! Schema was not applied.');
        console.log('>>> FIX: Open MySQL Workbench, open schema.sql and run it.');
        process.exit(1);
    }

    // Test 4: Check users table
    const tableNames = tables.map(t => Object.values(t)[0]);
    if (!tableNames.includes('users')) {
        console.error('❌ `users` table is missing!');
        process.exit(1);
    }
    const [users] = await conn.query('SELECT COUNT(*) as cnt FROM users');
    console.log('✅ `users` table exists, rows:', users[0].cnt);

    await conn.end();
    console.log('\n✅ All checks passed! Database is ready.');
    console.log('>>> Now start the server: node server.js');
    console.log('>>> Then open: http://localhost:3001/login.html');
}

diagnose().catch(e => {
    console.error('Unexpected error:', e.message);
    process.exit(1);
});
