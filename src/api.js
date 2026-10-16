const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000/api').replace(/\/+$/, '')
const TOKEN_KEY = 'oracion-session'

let refreshPromise

export function getTokens() {
  try {
    const tokens = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null')
    return tokens?.access_token && tokens?.refresh_token ? tokens : null
  } catch {
    sessionStorage.removeItem(TOKEN_KEY)
    return null
  }
}

export function saveTokens(tokens) {
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(tokens))
}

export function clearTokens() {
  sessionStorage.removeItem(TOKEN_KEY)
}

async function send(path, { method = 'GET', body, accessToken } = {}) {
  let response

  try {
    response = await fetch(`${API_BASE_URL}/${path.replace(/^\/+/, '')}`, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    throw new Error(`Cannot reach the API at ${API_BASE_URL}. Check the backend URL and that the API is online.`)
  }

  let payload
  try {
    payload = await response.json()
  } catch {
    payload = null
  }

  if (!response.ok) {
    const message = typeof payload?.error === 'string'
      ? payload.error
      : `The API request failed with status ${response.status}.`
    const error = new Error(message)
    error.status = response.status
    throw error
  }

  return payload
}

async function refreshTokens() {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const tokens = getTokens()
      if (!tokens?.refresh_token) {
        throw new Error('Your session has expired. Please sign in again.')
      }

      try {
        const result = await send('refresh', {
          method: 'POST',
          body: { refresh_token: tokens.refresh_token },
        })
        if (!result?.tokens?.access_token || !result?.tokens?.refresh_token) {
          throw new Error('The API returned an invalid refresh response.')
        }
        saveTokens(result.tokens)
        return result.tokens
      } catch (error) {
        clearTokens()
        throw error
      }
    })().finally(() => {
      refreshPromise = undefined
    })
  }

  return refreshPromise
}

export async function apiRequest(path, options = {}) {
  const { auth = true, ...requestOptions } = options
  const tokens = auth ? getTokens() : null

  try {
    return await send(path, {
      ...requestOptions,
      accessToken: tokens?.access_token,
    })
  } catch (error) {
    if (!auth || error.status !== 401 || !tokens?.refresh_token) {
      throw error
    }

    const currentTokens = getTokens()
    if (currentTokens?.access_token && currentTokens.access_token !== tokens.access_token) {
      return send(path, {
        ...requestOptions,
        accessToken: currentTokens.access_token,
      })
    }

    const refreshed = await refreshTokens()
    return send(path, {
      ...requestOptions,
      accessToken: refreshed.access_token,
    })
  }
}

export async function login(username, password) {
  const tokens = await apiRequest('login', {
    method: 'POST',
    auth: false,
    body: { username, password },
  })

  if (!tokens?.access_token || !tokens?.refresh_token) {
    throw new Error('The API returned an invalid login response.')
  }

  saveTokens(tokens)
  return tokens
}

export function register(username, email, password) {
  return apiRequest('register', {
    method: 'POST',
    auth: false,
    body: { username, email, password },
  })
}

export async function logout() {
  const tokens = getTokens()
  if (!tokens) return

  try {
    await apiRequest('logout', {
      method: 'POST',
      body: { refresh_token: tokens.refresh_token },
    })
  } finally {
    clearTokens()
  }
}
