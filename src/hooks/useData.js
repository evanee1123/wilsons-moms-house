import { useState, useEffect, useCallback } from 'react'
import { loadAllData } from '../services/dataService'
import { useLeague } from '../contexts/LeagueContext'

export function useData() {
  const { leagueId } = useLeague()
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await loadAllData(leagueId)
      setData(result)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [leagueId])

  useEffect(() => { load() }, [load])

  return { data, loading, error, refresh: load }
}