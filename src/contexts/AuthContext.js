import { createContext, useContext, useState, useEffect } from 'react';
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { auth, db } from '../firebase';

const LEAGUE_ID = '1312130103358021632';

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [currentUser,  setCurrentUser]  = useState(null);
  const [userProfile,  setUserProfile]  = useState(null);
  const [viewAsOwner,  setViewAsOwner]  = useState(null);
  const [authLoading,  setAuthLoading]  = useState(true);

  async function loadProfile(uid) {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) setUserProfile(snap.data());
  }

  async function login(email, password) {
    const result = await signInWithEmailAndPassword(auth, email, password);
    await loadProfile(result.user.uid);
    return result;
  }

  async function signup(email, password, sleeperUsername) {
    // 1. Confirm Sleeper account exists
    const userRes = await fetch(`https://api.sleeper.app/v1/user/${sleeperUsername}`);
    const sleeperUser = await userRes.json();
    if (!sleeperUser?.user_id) {
      throw new Error('Sleeper username not found. Double-check your exact username.');
    }

    // 2. Confirm account is in this league
    const leagueRes = await fetch(`https://api.sleeper.app/v1/league/${LEAGUE_ID}/users`);
    const leagueUsers = await leagueRes.json();
    const member = leagueUsers.find(u => u.user_id === sleeperUser.user_id);
    if (!member) {
      throw new Error("This Sleeper account isn't in the Wilson's Moms House league.");
    }

    // 3. Create Firebase Auth account
    const result = await createUserWithEmailAndPassword(auth, email, password);

    // 4. Write Firestore profile
    // display_name matches the Owner field used throughout the app's JSON data
    const rosterOwnerName = member.display_name || sleeperUsername;
    const profile = {
      uid: result.user.uid,
      email,
      sleeperUsername,
      rosterOwnerName,
      createdAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'users', result.user.uid), profile);
    setUserProfile(profile);
    return result;
  }

  async function logout() {
    await signOut(auth);
    setUserProfile(null);
    setViewAsOwner(null);
  }

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async user => {
      setCurrentUser(user);
      if (user) {
        await loadProfile(user.uid);
      } else {
        setUserProfile(null);
        setViewAsOwner(null);
      }
      setAuthLoading(false);
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{
      currentUser,
      userProfile,
      viewAsOwner,
      setViewAsOwner,
      login,
      signup,
      logout,
      authLoading,
    }}>
      {!authLoading && children}
    </AuthContext.Provider>
  );
}
