const ACTIVE_TRAIL_BASE_URL = 'https://webapi.mymarketing.co.il/api';

function normalizeSmsPhone(phone) {
  const cleanPhone = String(phone || '').trim().replace(/[\s-]/g, '');
  if (!cleanPhone) return '';
  if (cleanPhone.startsWith('+')) return cleanPhone;
  if (cleanPhone.startsWith('972')) return `+${cleanPhone}`;
  if (cleanPhone.startsWith('0')) return `+972${cleanPhone.slice(1)}`;
  return cleanPhone;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const token = (process.env.ACTIVE_TRAIL_API_KEY || '').trim();
  const groupIdValue = String(process.env.ACTIVE_TRAIL_GROUP_ID || '236994').trim();
  const groupId = Number(groupIdValue);

  const params = event.queryStringParameters || {};
  const bodyData = JSON.parse(event.body || '{}');
  const debugMode = params.debug || bodyData.debug;

  // debug=1: בדיקת גרופ בסיסית
  if (debugMode === '1') {
    const groupResponse = await fetch(`${ACTIVE_TRAIL_BASE_URL}/groups/${groupId}`, {
      method: 'GET',
      headers: { Authorization: token }
    });
    const groupResponseText = await groupResponse.text();
    return {
      statusCode: 200,
      body: JSON.stringify({
        hasToken: Boolean(token),
        tokenLength: token.length,
        groupId,
        groupCheckStatus: groupResponse.status,
        groupCheckResponse: groupResponseText
      })
    };
  }

  // debug=2: בדיקת שלושת שיטות ה-auth מול import endpoint
  if (debugMode === '2') {
    const testPayload = {
      group: groupId,
      contacts: [{
        contact: {
          email: 'debugtest@test.com',
          sms: '+972501234567',
          first_name: 'Debug',
          last_name: 'Test',
          is_deleted: false
        },
        externalId: String(Date.now()),
        externalName: 'RecyclesAlutoTestRide'
      }]
    };

    const r1 = await fetch(`${ACTIVE_TRAIL_BASE_URL}/external/import`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });
    const t1 = await r1.text();

    const r2 = await fetch(`${ACTIVE_TRAIL_BASE_URL}/external/import`, {
      method: 'POST',
      headers: { AppIdToken: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });
    const t2 = await r2.text();

    const r3 = await fetch(`${ACTIVE_TRAIL_BASE_URL}/external/import?Authorization=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload)
    });
    const t3 = await r3.text();

    return {
      statusCode: 200,
      body: JSON.stringify({
        attempt1_Authorization_header: { status: r1.status, response: t1 },
        attempt2_AppIdToken_header: { status: r2.status, response: t2 },
        attempt3_query_param: { status: r3.status, response: t3 }
      }, null, 2)
    };
  }

  try {
    const data = bodyData;

    if (!data.email) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Missing email' }) };
    }

    if (data.marketingApproved !== true) {
      return {
        statusCode: 200,
        body: JSON.stringify({ ok: true, skipped: true, reason: 'Marketing approval was not checked' })
      };
    }

    if (!token) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing ACTIVE_TRAIL_API_KEY' }) };
    }

    if (!groupIdValue || !Number.isFinite(groupId)) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Missing or invalid ACTIVE_TRAIL_GROUP_ID' }) };
    }

    const contact = {
      email: data.email,
      sms: normalizeSmsPhone(data.phone),
      first_name: data.firstName || '',
      last_name: data.lastName || '',
      is_deleted: false
    };

    const externalId = String(Date.now());
    const activeTrailPayload = {
      group: groupId,
      contacts: [{ contact, externalId, externalName: 'RecyclesAlutoTestRide' }]
    };

    const response = await fetch(`${ACTIVE_TRAIL_BASE_URL}/external/import`, {
      method: 'POST',
      headers: { Authorization: token, 'Content-Type': 'application/json' },
      body: JSON.stringify(activeTrailPayload)
    });

    const responseText = await response.text();

    if (!response.ok) {
      return {
        statusCode: response.status,
        body: JSON.stringify({ error: 'ActiveTrail request failed', details: responseText })
      };
    }

    const responseData = JSON.parse(responseText);

    if (responseData.contact_errors && responseData.contact_errors.length > 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Contact import error', details: responseData.contact_errors })
      };
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true, data: responseData }) };

  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'ActiveTrail submit failed', details: error.message })
    };
  }
};
