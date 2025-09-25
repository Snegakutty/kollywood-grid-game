// client/src/api.js
export const SERVER = process.env.REACT_APP_SERVER || 'http://localhost:4000';

export async function createGame(numPlayers) {
  const r = await fetch(`${SERVER}/create-game`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ numPlayers })
  });
  return r.json();
}
