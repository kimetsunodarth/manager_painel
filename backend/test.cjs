const Database = require('better-sqlite3'); const db = new Database('./src/data/ananim.db'); const row = db.prepare('SELECT * FROM users WHERE name LIKE ?').get('%Edmar%'); console.log(row);
