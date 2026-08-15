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
    // expanded list of API versions to try (newer first)
    // Put 2023-05-15 early since some AI Studio projects only accept this
    tryVersions.push('2023-05-15');
    tryVersions.push(
      '2024-12-01-preview',
      '2024-10-31-preview',
      '2024-09-01-preview',
      '2024-06-14-preview',
      '2023-07-01-preview'
    );

    let lastError = null;
    let resultData = null;

    if (!endpoint || !deployment || !apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing server configuration' }) };
    }

    // Normalize base URL (strip project path if present)
    let apiBase = endpoint;
    if (endpoint.includes('/api/')) apiBase = endpoint.split('/api/')[0];

    // Try each API version until one succeeds. For Azure AI Studio projects endpoints
    // the path can be different; we'll try both common patterns:
    // 1) /openai/deployments/{deployment}/chat/completions (classic Azure OpenAI)
    // 2) /api/projects/{project}/chat/completions?deployment={deployment} (AI Studio Projects)
    // If the provided AZURE_ENDPOINT already contains '/api/projects/', we'll extract the project name.
    let projectName = null;
    const match = endpoint && endpoint.match(/\/api\/projects\/([^\/\?]+)/);
    if (match) projectName = match[1];

    for (const apiVersion of tryVersions) {
      try {
        // Try classic OpenAI-style path
        let url1 = `${apiBase}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;
        let resp = await fetch(url1, {
          method: 'POST',
          headers: {
            // Try Projects-style deployments path (some resources expose deployments under /api/projects/{project}/deployments/{deployment})
            const urlProjectDeployment = `${apiBase}/api/projects/${encodeURIComponent(projectName)}/deployments/${encodeURIComponent(deployment)}/chat/completions?api-version=${apiVersion}`;
            let respProjDep = await fetch(urlProjectDeployment, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'api-key': apiKey,
                'api-version': apiVersion,
              },
              body: JSON.stringify({ messages: fullMessages, max_tokens: 512, temperature: 0.2 }),
            }).catch(()=>null);

            let dataProjDep = respProjDep ? await respProjDep.json().catch(()=>null) : null;
            if (respProjDep && respProjDep.ok && dataProjDep) {
              resultData = dataProjDep;
              break;
            }

            'Content-Type': 'application/json',
            'api-key': apiKey,
            'api-version': apiVersion,
          },
          body: JSON.stringify({ messages: fullMessages, max_tokens: 512, temperature: 0.2 }),
        });

        let data = await resp.json().catch(()=>null);
        if (resp.ok && data) {
          resultData = data;
          break;
        }

        // If a projectName exists, try the Projects-style path
        if (projectName) {
          // Try Projects-style with deployment as query param
          const url2 = `${apiBase}/api/projects/${encodeURIComponent(projectName)}/chat/completions?deployment=${encodeURIComponent(deployment)}&api-version=${apiVersion}`;
          resp = await fetch(url2, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': apiKey,
              'api-version': apiVersion,
            },
            body: JSON.stringify({ messages: fullMessages, max_tokens: 512, temperature: 0.2 }),
          });

          data = await resp.json().catch(()=>null);
          if (resp.ok && data) {
            resultData = data;
            break;
          }

          // Try Projects-style passing deployment in the request body (some endpoints expect this)
          const url3 = `${apiBase}/api/projects/${encodeURIComponent(projectName)}/chat/completions?api-version=${apiVersion}`;
          resp = await fetch(url3, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'api-key': apiKey,
              'api-version': apiVersion,
            },
            body: JSON.stringify({ deployment: deployment, messages: fullMessages, max_tokens: 512, temperature: 0.2 }),
          });

          data = await resp.json().catch(()=>null);
          if (resp.ok && data) {
            resultData = data;
            break;
          }

          // record last error if none succeeded
          lastError = { status: resp.status, body: data, apiVersion };
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
