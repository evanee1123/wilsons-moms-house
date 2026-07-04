import { createContext, useContext, useState } from 'react';

const WMH_LEAGUE_ID   = '1312130103358021632';
const WMH_LEAGUE_NAME = "Wilson's Moms House";

const LS_ID_KEY   = 'wmh_league_id';
const LS_NAME_KEY = 'wmh_league_name';

function getInitialLeague() {
  const id   = localStorage.getItem(LS_ID_KEY);
  const name = localStorage.getItem(LS_NAME_KEY);
  if (id && name) return { id, name };
  // First visit — write defaults so app behaves identically to today
  localStorage.setItem(LS_ID_KEY,   WMH_LEAGUE_ID);
  localStorage.setItem(LS_NAME_KEY, WMH_LEAGUE_NAME);
  return { id: WMH_LEAGUE_ID, name: WMH_LEAGUE_NAME };
}

const LeagueContext = createContext(null);

export function useLeague() {
  return useContext(LeagueContext);
}

export function LeagueProvider({ children }) {
  const initial = getInitialLeague();
  const [leagueId,   setLeagueId]   = useState(initial.id);
  const [leagueName, setLeagueName] = useState(initial.name);

  function setLeague(id, name) {
    localStorage.setItem(LS_ID_KEY,   id);
    localStorage.setItem(LS_NAME_KEY, name);
    setLeagueId(id);
    setLeagueName(name);
  }

  return (
    <LeagueContext.Provider value={{ leagueId, leagueName, setLeague }}>
      {children}
    </LeagueContext.Provider>
  );
}
