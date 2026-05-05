import { useState, useMemo, useEffect } from 'react'

const HISTORY_KEY = 'dynasty_trade_history'

function ktcValueAdjustment(targetKtc, nPieces, starSideTotal = null) {
  if (nPieces <= 1) return 0
  const baseRates = { 2: 0.46, 3: 0.55, 4: 0.63, 5: 0.70 }
  const baseRate  = baseRates[nPieces] || 0.75
  const studMult  = 1.0 + Math.max(0, (targetKtc - 5000) / 100) * 0.003
  let adj         = Math.round(targetKtc * baseRate * studMult)
  if (starSideTotal && starSideTotal > targetKtc) {
    const ratio = Math.pow(targetKtc / starSideTotal, 0.9)
    adj         = Math.round(adj * ratio)
  }
  return adj
}

function SearchBox({ label, assets, onAdd, allPlayers, side }) {
  const [query, setQuery] = useState('')
  const [open,  setOpen]  = useState(false)

  const results = useMemo(() => {
    if (!query || query.length < 2) return []
    return allPlayers
      .filter(p => {
        const name = p.Player || p['Player / Pick'] || ''
        return name.toLowerCase().includes(query.toLowerCase())
      })
      .slice(0, 8)
  }, [query, allPlayers])

  function handleSelect(player) {
    if (assets.length >= 5) return
    onAdd(player)
    setQuery('')
    setOpen(false)
  }

  return (
    <div style={{ position: 'relative', marginBottom: '8px' }}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={`Search players or picks for ${label}...`}
        style={{
          width: '100%', padding: '8px 12px', borderRadius: '8px', fontSize: '13px',
          border: '1px solid var(--card-border)', background: 'var(--card-bg)',
          color: 'var(--text-primary)',
        }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
          background: 'var(--card-bg)', border: '1px solid var(--card-border)',
          borderRadius: '8px', boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
          maxHeight: '240px', overflowY: 'auto', marginTop: '4px'
        }}>
          {results.map((p, i) => {
            const name = p.Player || p['Player / Pick'] || ''
            const ktc  = parseInt(p['KTC Value'] || 0)
            const pos  = p.Position || ''
            return (
              <div
                key={i}
                onMouseDown={() => handleSelect(p)}
                style={{
                  padding: '8px 12px', cursor: 'pointer', fontSize: '13px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  borderBottom: '1px solid var(--card-border)'
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--page-bg)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <span>
                  <span style={{ fontWeight: 500, color: 'var(--text-primary)' }}>{name}</span>
                  {pos && <span style={{ fontSize: '11px', color: 'var(--text-muted)',
                                        marginLeft: '6px' }}>{pos}</span>}
                </span>
                <span style={{ fontSize: '12px', fontWeight: 600,
                               color: 'var(--text-secondary)' }}>
                  {ktc.toLocaleString()}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AssetList({ assets, onRemove }) {
  if (assets.length === 0) return (
    <div style={{ padding: '1rem', textAlign: 'center', fontSize: '13px',
                  color: 'var(--text-muted)', border: '1px dashed var(--card-border)',
                  borderRadius: '8px' }}>
      No assets added yet
    </div>
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
      {assets.map((p, i) => {
        const name     = p.Player || p['Player / Pick'] || ''
        const ktc      = parseInt(p['KTC Value'] || 0)
        const combined = parseInt(p['Combined Score'] || p['KTC Value'] || 0)
        const pos      = p.Position || ''
        return (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 10px', background: 'var(--page-bg)', borderRadius: '8px',
            border: '1px solid var(--card-border)'
          }}>
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500,
                            color: 'var(--text-primary)' }}>{name}</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '1px' }}>
                {pos && `${pos} · `}KTC: {ktc.toLocaleString()} · Combined: {combined.toLocaleString()}
              </div>
            </div>
            <button
              onClick={() => onRemove(i)}
              style={{
                background: 'none', border: 'none', color: 'var(--text-muted)',
                fontSize: '16px', cursor: 'pointer', padding: '2px 6px',
                borderRadius: '4px', lineHeight: 1
              }}
            >×</button>
          </div>
        )
      })}
    </div>
  )
}

function ValueBar({ giveCombined, receiveCombined, adjustment, nGive, nReceive }) {
  const topStarGive    = giveCombined
  const topStarReceive = receiveCombined

  let giveNeeded, receiveNeeded, adj

  if (nGive > nReceive) {
    adj          = ktcValueAdjustment(topStarReceive, nGive, receiveCombined)
    giveNeeded   = giveCombined
    receiveNeeded = receiveCombined + adj
  } else if (nReceive > nGive) {
    adj          = ktcValueAdjustment(topStarGive, nReceive, giveCombined)
    giveNeeded   = giveCombined + adj
    receiveNeeded = receiveCombined
  } else {
    adj          = 0
    giveNeeded   = giveCombined
    receiveNeeded = receiveCombined
  }

  const surplus   = receiveNeeded - giveNeeded
  const maxVal    = Math.max(giveNeeded, receiveNeeded, 1000)
  const markerPct = Math.min(Math.max(
    50 - (surplus / maxVal) * 50, 5
  ), 95)

  function getMarkerColor(pct) {
    // pct 0-100, 0=green (winning), 100=red (overpaying)
    // Color stops: 0=green, 25=light green, 50=yellow, 75=orange, 100=red
    if (pct < 25)  return '#38a169'
    if (pct < 40)  return '#68d391'
    if (pct < 60)  return '#d69e2e'
    if (pct < 75)  return '#dd6b20'
    return '#e53e3e'
  }

const markerColor = getMarkerColor(markerPct)

  return (
    <div style={{ padding: '1.5rem 1rem 1rem' }}>
      {/* Value summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
              gap: '1rem', marginBottom: '1.25rem' }}>
  <div style={{ background: 'var(--page-bg)', borderRadius: '8px', padding: '10px 12px' }}>
    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
      You Give
    </div>
    <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
      {giveNeeded.toLocaleString()}
    </div>
    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
      Face: {giveCombined.toLocaleString()}
      {nReceive > nGive && adj > 0 && ` + ${adj.toLocaleString()} stud tax`}
    </div>
  </div>
  <div style={{ background: 'var(--page-bg)', borderRadius: '8px', padding: '10px 12px' }}>
    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '4px' }}>
      You Receive
    </div>
    <div style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text-primary)' }}>
      {receiveNeeded.toLocaleString()}
    </div>
    <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px' }}>
      Face: {receiveCombined.toLocaleString()}
      {nGive > nReceive && adj > 0 && ` + ${adj.toLocaleString()} stud premium`}
    </div>
  </div>
</div>

      {/* Value bar */}
      <div style={{ marginBottom: '8px' }}>
        <div style={{ position: 'relative', height: '12px', borderRadius: '99px',
                      background: `linear-gradient(to right, #38a169, #68d391, #d69e2e, #dd6b20, #e53e3e)`,
                      overflow: 'visible' }}>
          <div style={{
            position: 'absolute', top: '50%', transform: 'translate(-50%, -50%)',
            left: `${markerPct}%`, width: '20px', height: '20px',
            borderRadius: '50%', background: markerColor,
            border: '3px solid var(--card-bg)', transition: 'left 0.3s ease',
            boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            zIndex: 1
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between',
                      fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
          <span>Winning</span>
          <span>Fair</span>
          <span>Overpaying</span>
        </div>
      </div>

      {/* Surplus */}
      <div style={{ textAlign: 'center', marginTop: '1rem' }}>
        <span style={{
          fontSize: '15px', fontWeight: 700,
          color: surplus > 0 ? '#38a169' : surplus < -300 ? '#e53e3e' : '#d69e2e'
        }}>
          {surplus > 0 ? '+' : ''}{surplus.toLocaleString()} surplus
        </span>
      </div>
    </div>
  )
}

export default function TradeCalculator({ data }) {
  const [giveAssets,    setGiveAssets]    = useState([])
  const [receiveAssets, setReceiveAssets] = useState([])
  const [history,       setHistory]       = useState(() => {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || [] }
    catch { return [] }
  })

  useEffect(() => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history))
  }, [history])

  // Combined player + pick list for search
  const allPlayers = useMemo(() => {
    const players = data?.playerUniverse || []
    const picks   = (data?.pickPortfolio || [])
      .filter((p, i, arr) =>
        arr.findIndex(x => x['Pick Name'] === p['Pick Name']) === i
      )
      .map(p => ({
        Player:           p['Pick Name'],
        'Player / Pick':  p['Pick Name'],
        Position:         'Pick',
        'KTC Value':      p['KTC Value'],
        'Combined Score': p['KTC Value'],
      }))
    return [...players, ...picks]
  }, [data])

  function addToGive(player) {
    if (giveAssets.length >= 5) return
    setGiveAssets(prev => [...prev, player])
  }

  function addToReceive(player) {
    if (receiveAssets.length >= 5) return
    setReceiveAssets(prev => [...prev, player])
  }

  function removeFromGive(i)    { setGiveAssets(prev => prev.filter((_, idx) => idx !== i)) }
  function removeFromReceive(i) { setReceiveAssets(prev => prev.filter((_, idx) => idx !== i)) }

  function saveToHistory() {
    if (giveAssets.length === 0 || receiveAssets.length === 0) return
    const entry = {
      id:        Date.now(),
      date:      new Date().toLocaleDateString(),
      give:      giveAssets.map(p => p.Player || p['Player / Pick']),
      receive:   receiveAssets.map(p => p.Player || p['Player / Pick']),
      giveFace:  giveTotal,
      recFace:   receiveTotal,
      surplus:   receiveTotal - giveTotal,
    }
    setHistory(prev => [entry, ...prev].slice(0, 20))
  }

  function clearTrade() {
    setGiveAssets([])
    setReceiveAssets([])
  }

  const giveTotal    = giveAssets.reduce((s, p) =>
    s + parseInt(p['Combined Score'] || p['KTC Value'] || 0), 0)
  const receiveTotal = receiveAssets.reduce((s, p) =>
    s + parseInt(p['Combined Score'] || p['KTC Value'] || 0), 0)

  const hasAssets = giveAssets.length > 0 || receiveAssets.length > 0

  return (
    <div className='page'>
      <div className='page-title'>Trade Calculator</div>
      <div className='page-subtitle'>
        Uses combined score (60% KTC + 40% production) · Includes stud tax adjustment
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr',
                    gap: '1.25rem', marginBottom: '1.25rem' }}>
        {/* Give side */}
        <div className='card' style={{ padding: '1rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#e53e3e',
                        marginBottom: '10px', textTransform: 'uppercase',
                        letterSpacing: '0.05em' }}>
            You Give ({giveAssets.length}/5)
          </div>
          <SearchBox
            label='give'
            assets={giveAssets}
            onAdd={addToGive}
            allPlayers={allPlayers}
            side='give'
          />
          <AssetList assets={giveAssets} onRemove={removeFromGive} />
        </div>

        {/* Receive side */}
        <div className='card' style={{ padding: '1rem' }}>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#38a169',
                        marginBottom: '10px', textTransform: 'uppercase',
                        letterSpacing: '0.05em' }}>
            You Receive ({receiveAssets.length}/5)
          </div>
          <SearchBox
            label='receive'
            assets={receiveAssets}
            onAdd={addToReceive}
            allPlayers={allPlayers}
            side='receive'
          />
          <AssetList assets={receiveAssets} onRemove={removeFromReceive} />
        </div>
      </div>

      {/* Value bar */}
      {hasAssets && (
        <div className='card'>
          <ValueBar
            giveCombined={giveTotal}
            receiveCombined={receiveTotal}
            nGive={giveAssets.length}
            nReceive={receiveAssets.length}
          />
        </div>
      )}

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '10px', marginBottom: '1.25rem' }}>
        {hasAssets && (
          <>
            <button
              onClick={saveToHistory}
              style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                background: 'var(--blue)', color: '#fff', border: 'none', cursor: 'pointer'
              }}
            >
              Save to history
            </button>
            <button
              onClick={clearTrade}
              style={{
                padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 600,
                background: 'var(--card-bg)', color: 'var(--text-secondary)',
                border: '1px solid var(--card-border)', cursor: 'pointer'
              }}
            >
              Clear trade
            </button>
          </>
        )}
      </div>

      {/* Trade history */}
      {history.length > 0 && (
        <div className='card'>
          <div className='card-header'>
            <h3>Trade History</h3>
            <button
              onClick={() => setHistory([])}
              style={{
                background: 'none', border: 'none', fontSize: '12px',
                color: 'var(--text-muted)', cursor: 'pointer'
              }}
            >
              Clear all
            </button>
          </div>
          <div style={{ padding: '0.5rem' }}>
            {history.map(entry => (
              <div key={entry.id} style={{
                padding: '10px 12px', borderRadius: '8px', marginBottom: '6px',
                background: 'var(--page-bg)', border: '1px solid var(--card-border)'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between',
                              alignItems: 'flex-start' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', marginBottom: '4px' }}>
                      <span style={{ color: '#e53e3e', fontWeight: 600 }}>Give: </span>
                      <span style={{ color: 'var(--text-primary)' }}>
                        {entry.give.join(', ')}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px' }}>
                      <span style={{ color: '#38a169', fontWeight: 600 }}>Receive: </span>
                      <span style={{ color: 'var(--text-primary)' }}>
                        {entry.receive.join(', ')}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', marginLeft: '1rem' }}>
                    <div style={{
                      fontSize: '13px', fontWeight: 700,
                      color: entry.surplus > 0 ? '#38a169'
                        : entry.surplus < -300 ? '#e53e3e' : '#d69e2e'
                    }}>
                      {entry.surplus > 0 ? '+' : ''}{entry.surplus.toLocaleString()}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)',
                                  marginTop: '2px' }}>
                      {entry.date}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}