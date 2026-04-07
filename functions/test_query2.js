const admin = require('firebase-admin');

// Trying to initialize without specific credentials first, if it fails, we will need to query via browser or create a proxy
try {
  admin.initializeApp({ projectId: "valentinacosmeticos-5f239" });
} catch(e) { /* ignore */ }

const db = admin.firestore();

async function check() {
    try {
        // Obter os leads recentes
        const snap = await db.collection("leads").orderBy('updatedAt', 'desc').limit(5).get();
        for (let doc of snap.docs) {
            console.log("=== LEAD:", doc.data().name, doc.id);
            // Obter as ultimas 5 mensagens deste lead
            const msgs = await db.collection("leads").doc(doc.id).collection("messages").orderBy('timestamp', 'desc').limit(5).get();
            msgs.forEach(mDoc => {
                const m = mDoc.data();
                if (m.imageUrl || m.audioUrl) {
                    console.log("  [MEDIA MSG]:", mDoc.id, {
                        sender: m.sender,
                        imageUrl: m.imageUrl ? m.imageUrl.substring(0,100) + (m.imageUrl.length>100?'...':'') : undefined,
                        audioUrl: m.audioUrl ? m.audioUrl.substring(0,100) + (m.audioUrl.length>100?'...':'') : undefined,
                        text: m.text,
                        timestamp: m.timestamp ? m.timestamp.toDate() : null
                    });
                }
            });
        }
    } catch(e) {
        console.error("Erro:", e);
    }
    process.exit(0);
}
check();
