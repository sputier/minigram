import { describe, expect, it } from 'vitest'
import { checkAdminPassword } from './authGate'

describe('checkAdminPassword', () => {
  it('accepte le bon mot de passe', () => {
    expect(checkAdminPassword('secret123', 'secret123')).toBe(true)
  })

  it('refuse un mauvais mot de passe', () => {
    expect(checkAdminPassword('wrong', 'secret123')).toBe(false)
  })

  it('refuse une chaîne vide', () => {
    expect(checkAdminPassword('', 'secret123')).toBe(false)
  })

  it("refuse si aucun mot de passe n'est configuré côté .env", () => {
    expect(checkAdminPassword('anything', '')).toBe(false)
  })
})
