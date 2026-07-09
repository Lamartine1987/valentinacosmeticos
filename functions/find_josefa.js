const admin = require('firebase-admin'); 
const sa = require('./serviceAccountKey.json'); 
if (!admin.apps.length) {
    admin.initializeApp({credential: admin.credential.cert(sa)}); 
}
const db = admin.firestore(); 
async function run() {
    try {
        const snap = await db.collection('sales').get(); 
        console.log('Total sales:', snap.size); 
        let found = false;
        snap.forEach(doc => { 
            const data = doc.data();
            if (data.name && data.name.toLowerCase().includes('josefa')) { 
                console.log('Found Sale:', doc.id, JSON.stringify(data)); 
                found = true;
            } 
        }); 
        if (!found) {
            console.log('No sale found for Josefa.');
        }
    } catch(e) {
        console.error(e);
    } finally {
        process.exit(0); 
    }
}
run();
