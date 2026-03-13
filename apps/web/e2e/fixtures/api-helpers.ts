const API = "http://localhost:3001/api/v1";

export async function loginAndGetToken(): Promise<string> {
  const res = await fetch(`${API}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "dev@getdtax.com",
      password: "devpassword123",
    }),
  });
  const { data } = await res.json();
  return data.token;
}

export async function getTransactionCount(token: string): Promise<number> {
  const res = await fetch(`${API}/transactions?limit=1`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { data } = await res.json();
  return data.total || 0;
}
