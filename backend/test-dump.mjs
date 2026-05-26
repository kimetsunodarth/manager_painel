import { userStore } from './src/data/store.js'; const u = userStore.getAll().find(x => x.name.includes('Edmar')); console.log(JSON.stringify(u, null, 2));
