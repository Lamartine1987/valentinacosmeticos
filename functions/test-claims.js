const admin = require('firebase-admin');
admin.initializeApp();
admin.auth().getUserByEmail('tonyadm@valletina.com')
    .then(u => {
        console.log('UID:', u.uid);
        return admin.auth().setCustomUserClaims(u.uid, { role: 'admin', storeId: 'all' });
    })
    .then(() => console.log('Claims set!'))
    .catch(e => console.log(e));
