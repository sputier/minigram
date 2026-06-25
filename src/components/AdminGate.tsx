import { useEffect, useState } from 'react'
import type { AuthState, PendingEntry, SearchResult } from '../types/telegram'

export default function AdminGate() {
  const [visible, setVisible] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [authState, setAuthState] = useState<AuthState>({ step: 'idle' })
  const [phoneInput, setPhoneInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [authPasswordInput, setAuthPasswordInput] = useState('')
  const [pending, setPending] = useState<PendingEntry[]>([])
  const [searchInput, setSearchInput] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])

  useEffect(() => {
    const offToggle = window.minigram.onAdminGateToggle(() => setVisible((v) => !v))
    const offAuthState = window.minigram.onAuthState((state) => setAuthState(state))
    return () => {
      offToggle()
      offAuthState()
    }
  }, [])

  useEffect(() => {
    if (unlocked && authState.step === 'ready') {
      window.minigram.getPendingRequests().then(setPending)
    }
  }, [unlocked, authState.step])

  if (!visible) return null

  async function handlePasswordSubmit() {
    const { ok } = await window.minigram.submitAdminPassword(passwordInput)
    setPasswordError(!ok)
    if (ok) {
      setUnlocked(true)
      setPasswordInput('')
    }
  }

  function close() {
    setVisible(false)
    setUnlocked(false)
    setPasswordInput('')
    setPasswordError(false)
    setSearchInput('')
    setSearchResults([])
  }

  async function handleApprove(entry: PendingEntry) {
    setPending(await window.minigram.approvePending(entry.kind, entry.id))
  }

  async function handleReject(entry: PendingEntry) {
    setPending(await window.minigram.rejectPending(entry.kind, entry.id))
  }

  async function handleSearch() {
    setSearchResults(await window.minigram.searchContacts(searchInput))
  }

  async function handleAddToWhitelist(result: SearchResult) {
    await window.minigram.addToWhitelist(result.kind, result.id)
    setSearchResults((prev) => prev.filter((r) => !(r.kind === result.kind && r.id === result.id)))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="max-h-[85vh] w-[28rem] overflow-y-auto rounded-lg bg-tg-sidebar p-6 text-white shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Espace parent</h2>
          <button onClick={close} className="text-sm text-tg-muted hover:text-white">
            Fermer
          </button>
        </div>

        {!unlocked ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-tg-muted">Mot de passe parent requis.</p>
            <input
              type="password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePasswordSubmit()}
              autoFocus
              className="rounded bg-tg-bg px-3 py-2 text-sm outline-none"
            />
            {passwordError && <p className="text-sm text-red-400">Mot de passe incorrect.</p>}
            <button
              onClick={handlePasswordSubmit}
              className="rounded bg-tg-accent px-3 py-2 text-sm font-medium"
            >
              Valider
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {authState.step === 'phone' && (
              <>
                <p className="text-sm text-tg-muted">
                  Numéro de téléphone du compte Telegram à connecter.
                  {authState.retry && ' Numéro invalide, réessaie.'}
                </p>
                <input
                  value={phoneInput}
                  onChange={(e) => setPhoneInput(e.target.value)}
                  placeholder="+33612345678"
                  className="rounded bg-tg-bg px-3 py-2 text-sm outline-none"
                />
                <button
                  onClick={() => window.minigram.submitPhoneNumber(phoneInput)}
                  className="rounded bg-tg-accent px-3 py-2 text-sm font-medium"
                >
                  Envoyer
                </button>
              </>
            )}

            {authState.step === 'code' && (
              <>
                <p className="text-sm text-tg-muted">
                  Code reçu par Telegram/SMS.{authState.retry && ' Code invalide, réessaie.'}
                </p>
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value)}
                  placeholder="12345"
                  className="rounded bg-tg-bg px-3 py-2 text-sm outline-none"
                />
                <button
                  onClick={() => window.minigram.submitAuthCode(codeInput)}
                  className="rounded bg-tg-accent px-3 py-2 text-sm font-medium"
                >
                  Envoyer
                </button>
              </>
            )}

            {authState.step === 'password' && (
              <>
                <p className="text-sm text-tg-muted">
                  Mot de passe de vérification en deux étapes
                  {authState.hint ? ` (indice : ${authState.hint})` : ''}.
                  {authState.retry && ' Mot de passe invalide, réessaie.'}
                </p>
                <input
                  type="password"
                  value={authPasswordInput}
                  onChange={(e) => setAuthPasswordInput(e.target.value)}
                  className="rounded bg-tg-bg px-3 py-2 text-sm outline-none"
                />
                <button
                  onClick={() => window.minigram.submitAuthPassword(authPasswordInput)}
                  className="rounded bg-tg-accent px-3 py-2 text-sm font-medium"
                >
                  Envoyer
                </button>
              </>
            )}

            {authState.step === 'ready' && (
              <div className="flex flex-col gap-4">
                <p className="text-sm text-green-400">Compte Telegram connecté ✓</p>

                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-tg-muted">Demandes en attente</h3>
                  {pending.length === 0 && <p className="text-xs text-tg-muted">Aucune demande.</p>}
                  {pending.map((entry) => (
                    <div
                      key={`${entry.kind}-${entry.id}`}
                      className="flex items-center justify-between gap-2 rounded bg-tg-bg px-3 py-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm">{entry.name}</p>
                        <p className="truncate text-xs text-tg-muted">{entry.preview}</p>
                      </div>
                      <div className="flex flex-shrink-0 gap-2">
                        <button
                          onClick={() => handleApprove(entry)}
                          className="rounded bg-tg-accent px-2 py-1 text-xs font-medium"
                        >
                          Approuver
                        </button>
                        <button
                          onClick={() => handleReject(entry)}
                          className="rounded bg-red-600 px-2 py-1 text-xs font-medium"
                        >
                          Rejeter
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-col gap-2">
                  <h3 className="text-sm font-semibold text-tg-muted">Rechercher un contact</h3>
                  <input
                    value={searchInput}
                    onChange={(e) => setSearchInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Nom, @pseudo..."
                    className="rounded bg-tg-bg px-3 py-2 text-sm outline-none"
                  />
                  <button
                    onClick={handleSearch}
                    className="self-start rounded bg-tg-accent px-3 py-1.5 text-xs font-medium"
                  >
                    Rechercher
                  </button>
                  <div className="flex flex-col gap-1">
                    {searchResults.map((result) => (
                      <div
                        key={`${result.kind}-${result.id}`}
                        className="flex items-center justify-between gap-2 rounded bg-tg-bg px-3 py-2"
                      >
                        <p className="truncate text-sm">{result.name}</p>
                        <button
                          onClick={() => handleAddToWhitelist(result)}
                          className="flex-shrink-0 rounded bg-tg-accent px-2 py-1 text-xs font-medium"
                        >
                          Ajouter à la whitelist
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {authState.step === 'error' && (
              <p className="text-sm text-red-400">Erreur : {authState.message}</p>
            )}

            {authState.step === 'idle' && (
              <p className="text-sm text-tg-muted">En attente de connexion...</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
