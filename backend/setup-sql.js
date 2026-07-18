require('dotenv').config();
const sql = require('mssql');

const servers = [
  process.env.DB_SERVER || 'localhost',
  'localhost\\SQLEXPRESS',
  '(local)\\SQLEXPRESS',
  '.\\SQLEXPRESS'
];

const config = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'root',
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableArithAbort: true
  }
};

async function testServer(server) {
  try {
    const pool = await sql.connect({ ...config, server, database: 'master' });
    const result = await pool.request().query('SELECT @@VERSION AS version');
    await pool.close();
    return { ok: true, server, version: result.recordset[0].version.split('\n')[0] };
  } catch (err) {
    return { ok: false, server, error: err.message };
  }
}

async function main() {
  console.log('\n========================================');
  console.log('  SQL Server Connection Test');
  console.log('========================================\n');
  console.log(`User: ${config.user}`);
  console.log(`Password: ${config.password}\n`);

  for (const server of [...new Set(servers)]) {
    process.stdout.write(`Testing ${server} ... `);
    const result = await testServer(server);
    if (result.ok) {
      console.log('✅ CONNECTED');
      console.log(`\nUse this in backend/.env:`);
      console.log(`DB_SERVER=${result.server}`);
      console.log(`DB_USER=${config.user}`);
      console.log(`DB_PASSWORD=${config.password}`);
      console.log(`DB_TYPE=mssql\n`);
      console.log(result.version);
      console.log('');
      process.exit(0);
    } else {
      console.log('❌ Failed');
      console.log(`   ${result.error}\n`);
    }
  }

  console.log('❌ Could not connect to SQL Server.');
  console.log('\nMake sure SQL Server is installed and running.');
  console.log('Download: https://www.microsoft.com/en-us/sql-server/sql-server-downloads\n');
  process.exit(1);
}

main();
