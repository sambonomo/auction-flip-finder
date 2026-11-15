// Prints the AUTH_USERS entry for one account:  node tools/hash-password.js <username> <password>
const crypto = require('crypto');
const [user, password] = process.argv.slice(2);
if (!user || !password) { console.error('usage: node tools/hash-password.js <username> <password>'); process.exit(1); }
const salt = crypto.randomBytes(16);
const hash = crypto.scryptSync(password, salt, 32);
console.log(JSON.stringify({ [user.toLowerCase()]: `${salt.toString('hex')}:${hash.toString('hex')}` }));
