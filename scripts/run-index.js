// Runner local do indexador F5 (mesma função do Netlify):
//   node scripts/run-index.js [--dry]
// --dry: só baixa e loga contagens (sem escrever no Supabase).
const { runIndexation } = require('../netlify/functions/catalog-index.js');

runIndexation({ dryRun: process.argv.includes('--dry') })
    .then(r => { console.log(JSON.stringify(r, null, 2)); process.exit(r.ok ? 0 : 1); })
    .catch(e => { console.error(e); process.exit(1); });
