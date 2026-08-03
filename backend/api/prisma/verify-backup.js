const { DatabaseSync } = require('node:sqlite')
const file = process.argv[2]
if (!file) throw new Error('backup file required')
const db = new DatabaseSync(file, { readOnly: true })
const userVersion = db.prepare('PRAGMA user_version').get().user_version
const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((row) => row.name).filter((name) => ['Order', 'Student', 'AccountStudent', 'Enrollment'].includes(name)).sort()
const counts = Object.fromEntries(tables.map((name) => [name, db.prepare(`SELECT COUNT(*) AS count FROM "${name}"`).get().count]))
console.log(JSON.stringify({ file, userVersion, tables, counts }))
db.close()
