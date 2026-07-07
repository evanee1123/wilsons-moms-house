import { createContext, useContext, useState } from 'react';

const LS_KEY = 'wmh_sleeper_user';

const SleeperAuthContext = createContext(null);

export function useSleeperAuth() {
  return useContext(SleeperAuthContext);
}

function getInitialSleeperUser() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function SleeperAuthProvider({ children }) {
  const [sleeperUser, setSleeperUser] = useState(getInitialSleeperUser);

  async function sleeperLogin(username) {
    const res = await fetch(`https://api.sleeper.app/v1/user/${username}`);
    const data = res.ok ? await res.json() : null;
    if (!data?.user_id) {
      throw new Error(`Sleeper username "${username}" not found.`);
    }
    const user = {
      user_id: data.user_id,
      display_name: data.display_name || username,
      username,
    };
    localStorage.setItem(LS_KEY, JSON.stringify(user));
    setSleeperUser(user);
    return user;
  }

  function sleeperLogout() {
    localStorage.removeItem(LS_KEY);
    setSleeperUser(null);
  }

  return (
    <SleeperAuthContext.Provider value={{ sleeperUser, sleeperLogin, sleeperLogout }}>
      {children}
    </SleeperAuthContext.Provider>
  );
}
