// Netlify Function to proxy chat requests to Azure OpenAI (AI Studio)
// Uses environment variables: AZURE_ENDPOINT, AZURE_DEPLOYMENT, AZURE_API_KEY, AZURE_API_VERSION

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body || '{}');
    const messages = body.messages || [];
    const SYSTEM_PROMPT = "You are an expert trip-planning assistant. Provide concise, practical travel advice, ask clarifying questions when necessary, and remind users to verify details like visas, travel restrictions, and bookings.";

    // Prepend a single system message
    const fullMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...messages];

    const endpoint = process.env.AZURE_ENDPOINT;
    const deployment = process.env.AZURE_DEPLOYMENT;
    const apiKey = process.env.AZURE_API_KEY;
    const configuredVersion = process.env.AZURE_API_VERSION;
    const tryVersions = [];
    if (configuredVersion) tryVersions.push(configuredVersion);
    // common API versions to try as fallbacks
    tryVersions.push('2024-06-14-preview', '2023-07-01-preview', '2023-05-15');

    let lastError = null;
    let resultData = null;

    if (!endpoint || !deployment || !apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing server configuration' }) };
    }

    // Normalize base URL (strip project path if present)
    let apiBase = endpoint;
    if (endpoint.includes('/api/')) apiBase = endpoint.split('/api/')[0];

    // Try each API version until one succeeds
    for (const apiVersion of tryVersions) {
      try {
        const url = `${apiBase}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'api-key': apiKey,
          },
          body: JSON.stringify({ messages: fullMessages, max_tokens: 512, temperature: 0.2 }),
        });

        const data = await resp.json();
        if (resp.ok && data) {
          resultData = data;
          break;
        } else {
          lastError = { status: resp.status, body: data, apiVersion };
        }
      } catch (err) {
        lastError = { error: String(err) };
      }
    }

    if (!resultData) {
      console.error('All API version attempts failed:', lastError);
      return { statusCode: 502, body: JSON.stringify({ error: 'AI service error', details: lastError }) };
    }

    // Extract reply from Azure response
    let reply = '';
    try {
      reply = (resultData.choices && resultData.choices[0] && (resultData.choices[0].message?.content || resultData.choices[0].text)) || '';
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
