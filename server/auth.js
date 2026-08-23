// Password hashing + session tokens using Node's built-in `node:crypto` —
// no extra dependency (bcrypt/argon2 etc. would need either native
// compilation or another package), consistent with this project's node:sqlite
// choice of leaning on what Node ships rather than adding install-time risk.
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto'

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000 // 30 days

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password, storedHash) {
  const [salt, hash] = (storedHash || '').split(':')
  if (!salt || !hash) return false
  const candidate = scryptSync(password, salt, 64)
  const expected = Buffer.from(hash, 'hex')
  return candidate.length === expected.length && timingSafeEqual(candidate, expected)
}

export function makeToken() {
  return randomBytes(32).toString('hex')
}

// A valid-shaped hash nobody's real password will match, computed once at
// startup. /api/auth/login always verifies against a real hash OR this one
// (never skips the scrypt call outright) so that a non-existent username
// costs exactly as much wall-clock time as a wrong password on a real
// account — otherwise the response-time difference between "no such user"
// (instant) and "wrong password" (one scrypt call) lets an attacker
// enumerate valid usernames without ever guessing a password.
export const DUMMY_HASH = hashPassword(randomBytes(32).toString('hex'))

export function sessionExpiryFromNow() {
  return new Date(Date.now() + SESSION_TTL_MS).toISOString()
}
