const firebase = window.firebase;

const firebaseConfig = {
  apiKey: "AIzaSyDvfKBg6BGG08wPvKQZLizSgausTxOrxT4",
  authDomain: "valentinacosmeticos-5f239.firebaseapp.com",
  projectId: "valentinacosmeticos-5f239",
  storageBucket: "valentinacosmeticos-5f239.firebasestorage.app",
  messagingSenderId: "761484272424",
  appId: "1:761484272424:web:db22ac49a15fdcfeaf661d"
};

let db;
let storage;
try {
    firebase.initializeApp(firebaseConfig);
    db = firebase.firestore();
    db.enablePersistence({ synchronizeTabs: true }).catch(err => console.warn('Persistência não ativada:', err));
    storage = firebase.storage();
} catch (e) {
    alert("Bloqueio de Carregamento na Nuvem! Verifique sua internet ou tente novamente. Código do erro: " + e.message);
}

export { firebase, db, storage };
