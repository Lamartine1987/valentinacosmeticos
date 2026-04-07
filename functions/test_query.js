const admin = require('firebase-admin');
admin.initializeApp({ projectId: "valentinacosmeticos-5f239" }); // Use simple emulator/local app initialization
const db = admin.firestore();

async function check() {
    try {
        const snap = await db.collection("leads").where("name", "==", "Central dos Importados 9").limit(1).get();
        if (snap.empty) {
            console.log("Not found.");
            // try to get any recent message with images
            const anyLeadSnap = await db.collection("leads").limit(10).get();
            for (let doc of anyLeadSnap.docs) {
                const msgSnap = await db.collection("leads").doc(doc.id).collection("messages").limit(5).get();
                for (let mDoc of msgSnap.docs) {
                    const data = mDoc.data();
                    if (data.imageUrl) {
                        console.log("Lead:", doc.id, "Image msg:", data);
                    }
                }
            }
        } else {
            const leadId = snap.docs[0].id;
            console.log("Lead ID:", leadId);
            const msgSnap = await db.collection("leads").doc(leadId).collection("messages").orderBy("timestamp", "desc").limit(5).get();
            msgSnap.forEach(d => console.log(d.id, d.data()));
        }
    } catch(e) {
        console.error(e);
    }
    process.exit(0);
}
check();
