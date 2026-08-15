// Netlify Function to proxy chat requests to Azure OpenAI (AI Studio)
// Uses environment variables: AZURE_ENDPOINT, AZURE_DEPLOYMENT, AZURE_API_KEY, AZURE_API_VERSION

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body || '{}');
    const messages = body.messages || [];

    const endpoint = process.env.AZURE_ENDPOINT;
    const deployment = process.env.AZURE_DEPLOYMENT;
    const apiKey = process.env.AZURE_API_KEY;
    const apiVersion = process.env.AZURE_API_VERSION || '2024-06-14-preview';

    if (!endpoint || !deployment || !apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing server configuration' }) };
    }

    // Normalize base URL (strip project path if present)
    let apiBase = endpoint;
    if (endpoint.includes('/api/')) apiBase = endpoint.split('/api/')[0];

    const url = `${apiBase}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey,
      },
      body: JSON.stringify({ messages, max_tokens: 512, temperature: 0.2 }),
    });

    const data = await resp.json();

    // Extract reply from Azure response
    let reply = '';
    try {
      reply = data.choices && data.choices[0] && (data.choices[0].message?.content || data.choices[0].text) || '';
    } catch (err) {
      reply = '';
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error('Function error', err);
    return { statusCode: 500, body: JSON.stringify({ error: 'Server error' }) };
  }
};
