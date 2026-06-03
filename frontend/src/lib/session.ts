const keyForJoinCode = (joinCode: string) => `nero-party:session:${joinCode.toUpperCase()}`;

export function storeSessionToken(joinCode: string, sessionToken: string) {
  localStorage.setItem(keyForJoinCode(joinCode), sessionToken);
}

export function getStoredSessionToken(joinCode: string) {
  return localStorage.getItem(keyForJoinCode(joinCode.toUpperCase()));
}

export function clearStoredSessionToken(joinCode: string) {
  localStorage.removeItem(keyForJoinCode(joinCode.toUpperCase()));
}
