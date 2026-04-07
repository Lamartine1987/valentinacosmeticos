const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

async function run() {
    try {
        console.log("Iniciando migração de storeIds...");

        // 1. Settings Collection
        const settingsSnap = await db.collection("settings").doc("whatsapp_api").get();
        if (settingsSnap.exists) {
            let data = settingsSnap.data();
            let changed = false;
            if (data.instances && Array.isArray(data.instances)) {
                data.instances = data.instances.map(inst => {
                    if (inst.storeId === 'matriz') { changed = true; return { ...inst, storeId: 'loja_1' }; }
                    if (inst.storeId === 'filial_1') { changed = true; return { ...inst, storeId: 'loja_2' }; }
                    return inst;
                });
            }
            if (changed) {
                await db.collection("settings").doc("whatsapp_api").update({ instances: data.instances });
                console.log("✅ Configurações de whatsapp_api atualizadas.");
            }
        }

        // Helper para coleções iteráveis
        async function migrateCollection(colName) {
             const snapshot = await db.collection(colName).get();
             let count = 0;
             let batch = db.batch();
             for (const doc of snapshot.docs) {
                 const data = doc.data();
                 if (data.storeId === 'matriz') {
                     batch.update(doc.ref, { storeId: 'loja_1' });
                     count++;
                 } else if (data.storeId === 'filial_1') {
                     batch.update(doc.ref, { storeId: 'loja_2' });
                     count++;
                 }
                 
                 if (count > 0 && count % 400 === 0) {
                     await batch.commit();
                     batch = db.batch(); // Create new batch after commit 
                 }
             }
             if (count % 400 !== 0 && count > 0) { // Commit remaining
                 await batch.commit();
             }
             console.log(`✅ Coleção ${colName} processada. Atualizados: ${count}`);
        }

        await migrateCollection("users");
        await migrateCollection("leads");
        await migrateCollection("clients");
        await migrateCollection("products");
        await migrateCollection("sales");

        // Auth Claims
        let pageToken;
        let authCount = 0;
        do {
            const listUsersResult = await admin.auth().listUsers(1000, pageToken);
            for (const userRecord of listUsersResult.users) {
                const claims = userRecord.customClaims || {};
                if (claims.storeId === 'matriz' || claims.storeId === 'filial_1') {
                    const newStoreId = claims.storeId === 'matriz' ? 'loja_1' : 'loja_2';
                    await admin.auth().setCustomUserClaims(userRecord.uid, {
                        ...claims,
                        storeId: newStoreId
                    });
                    authCount++;
                }
            }
            pageToken = listUsersResult.pageToken;
        } while (pageToken);
        console.log(`✅ Authentication Claims processadas. Atualizados: ${authCount}`);

        console.log("Migração concluída com sucesso!");
        process.exit(0);
    } catch (e) {
        console.error("Erro na migração:", e);
        process.exit(1);
    }
}
run();
