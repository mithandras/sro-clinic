export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const neonUrl = process.env.NEON_URL || 'https://ep-muddy-block-a7vygloq.ap-southeast-2.aws.neon.tech/sql';
  const neonConnectionString = process.env.NEON_CONNECTION_STRING || 'postgresql://neondb_owner:npg_RZr9MNKszY5P@ep-muddy-block-a7vygloq.ap-southeast-2.aws.neon.tech/neondb';


  const { query, params } = req.body;

  if (!query) {
    return res.status(400).json({ error: 'Missing query in request body' });
  }

  let response;
  try {
    response = await fetch(neonUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Neon-Connection-String': neonConnectionString,
        'Neon-Pool-Opt-In': 'true',
      },
      body: JSON.stringify({ query, params }),
    });
  } catch (err) {
    console.error('Neon fetch failed:', err.message);
    return res.status(502).json({ error: 'Failed to reach Neon: ' + err.message });
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    const raw = await response.text().catch(() => '(unreadable)');
    console.error('Neon response was not JSON. Status:', response.status, 'Body:', raw);
    return res.status(502).json({ error: 'Neon returned non-JSON response', status: response.status });
  }

  return res.status(response.status).json(data);
}