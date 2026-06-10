export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { query, params } = req.body;

  const response = await fetch(process.env.VITE_NEON_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Neon-Connection-String': process.env.VITE_NEON_CONNECTION_STRING,
      'Neon-Pool-Opt-In': 'true',
    },
    body: JSON.stringify({ query, params }),
  });

  const data = await response.json();
  res.status(response.status).json(data);
}