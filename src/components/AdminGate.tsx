import { useEffect, useState } from 'react'
import type { AuthState } from '../types/telegram'

export default function AdminGate() {
  const [visible, setVisible] = useState(false)
  const [unlocked, setUnlocked] = useState(false)
  const [passwordInput, setPasswordInput] = useState('')
  const [passwordError, setPasswordError] = useState(false)
  const [authState, setAuthState] = useState<AuthState>({ step: 'idle' })
  const [phoneInput, setPhoneInput] = useState('')
  const [codeInput, setCodeInput] = useState('')
  const [authPasswordInput, setAuthPasswordInput] = useState('')

  useEffect(() => {
    const offToggle = window.minigram.onAdminGateToggle(() => setVisible((v) => !v))
    const offAuthState = window.minigram.onAuthState((state) => setAuthState(state))
    return () => {
      offToggle()
      offAuthState()
    }
  }, [])

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
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-96 rounded-lg bg-tg-sidebar p-6 text-white shadow-xl">
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
              <p className="text-sm text-green-400">Compte Telegram connecté ✓</p>
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
