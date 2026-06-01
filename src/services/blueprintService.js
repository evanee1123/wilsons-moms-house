import { collection, doc, getDocs, addDoc, updateDoc, deleteDoc } from 'firebase/firestore'
import { db } from '../firebase'

const sub = (uid, name) => collection(db, 'users', uid, name)
const ref = (uid, name, id) => doc(db, 'users', uid, name, id)
const all = async (uid, name) => {
  const snap = await getDocs(sub(uid, name))
  return snap.docs.map(d => ({ id: d.id, ...d.data() }))
}

// Goals
export const loadGoals         = (uid)               => all(uid, 'goals')
export const saveGoal          = async (uid, goal)   => { const r = await addDoc(sub(uid, 'goals'), goal); return { id: r.id, ...goal } }
export const updateGoalStatus  = (uid, id, status)  => updateDoc(ref(uid, 'goals', id), { status })
export const deleteGoal        = (uid, id)           => deleteDoc(ref(uid, 'goals', id))

// Watchlist
export const loadWatchlist        = (uid)           => all(uid, 'watchlist')
export const addToWatchlist       = async (uid, item) => { const r = await addDoc(sub(uid, 'watchlist'), { ...item, addedAt: new Date().toISOString() }); return { id: r.id, ...item } }
export const removeFromWatchlist  = (uid, id)       => deleteDoc(ref(uid, 'watchlist', id))

// Dismissed suggestions
export const loadDismissed    = (uid)                       => all(uid, 'dismissedSuggestions')
export const dismissSuggestion = (uid, playerName, type)   => addDoc(sub(uid, 'dismissedSuggestions'), { playerName, type, dismissedAt: new Date().toISOString() })

// Saved suggestions
export const loadSaved              = (uid)           => all(uid, 'savedSuggestions')
export const saveSuggestion         = async (uid, s)  => { const r = await addDoc(sub(uid, 'savedSuggestions'), { ...s, savedAt: new Date().toISOString() }); return { id: r.id, ...s } }
export const removeSavedSuggestion  = (uid, id)       => deleteDoc(ref(uid, 'savedSuggestions', id))
