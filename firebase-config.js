// ============================================================
// Firebase Configuration
// ============================================================
// 1. Go to https://console.firebase.google.com and create a project
//    (or use an existing one).
// 2. In the left sidebar: Build > Realtime Database > Create Database.
//    Choose any region; start in "test mode" for now — we set proper
//    rules below in README.md before sharing the app with your friend.
// 3. In Project Settings (gear icon) > General > "Your apps" > click
//    the Web icon (</>) to register a web app. Firebase will show you
//    a config object — copy its values into the object below.
// ============================================================

const firebaseConfig = {
  apiKey: "AIzaSyBiY2kC5aLLrwE_z9xIGVbWVeq3MnyIsds",
  authDomain: "comtimer-3887f.firebaseapp.com",
  databaseURL: "https://comtimer-3887f-default-rtdb.firebaseio.com",
  projectId: "comtimer-3887f",
  storageBucket: "comtimer-3887f.firebasestorage.app",
  messagingSenderId: "650009917266",
  appId: "1:650009917266:web:3e7b7fa4a256b8f82bac8b",
  measurementId: "G-5XS4T7LTB5"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
