// Netlify Function — primește o imagine (base64) de la site, o trimite
// către Anthropic (server-side, cu cheia API secretă) și întoarce
// numerele de parfum recunoscute în ea.
//
// Cheia API NU stă în acest fișier — vine din variabila de mediu
// ANTHROPIC_API_KEY, setată în Netlify (Site settings → Environment variables).
// Așa rămâne secretă chiar dacă acest fișier ajunge public pe GitHub.

exports.handler = async function (event) {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ error: "Doar cereri POST sunt acceptate" }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: JSON.stringify({ error: "Corp de cerere invalid (nu e JSON)" }) };
  }

  const { image, mediaType } = payload;
  if (!image) {
    return { statusCode: 400, body: JSON.stringify({ error: "Lipsește imaginea" }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: "ANTHROPIC_API_KEY nu e configurată pe server (Netlify)" }) };
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: image,
                },
              },
              {
                type: "text",
                text:
                  'Aceasta e o poză cu o foaie scrisă de mână, cu numere de parfum. ' +
                  'Extrage TOATE numerele vizibile, în ordinea în care apar pe foaie. ' +
                  'Ignoră complet orice număr care e tăiat cu o linie (eliminat/anulat). ' +
                  'Răspunde STRICT cu un JSON valid, fără alt text înainte sau după, în formatul exact: ' +
                  '{"numere": ["47", "63", "96"]}',
              },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      const msg = (data && data.error && data.error.message) || "Eroare de la Anthropic API";
      return { statusCode: response.status, body: JSON.stringify({ error: msg }) };
    }

    const textBlock = (data.content || []).find((c) => c.type === "text");
    const textContent = textBlock ? textBlock.text : "";

    let numere = [];
    try {
      const match = textContent.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(match ? match[0] : textContent);
      numere = Array.isArray(parsed.numere) ? parsed.numere.map(String) : [];
    } catch (e) {
      return {
        statusCode: 200,
        body: JSON.stringify({ numere: [], warning: "Nu am putut interpreta răspunsul ca JSON", raw: textContent }),
      };
    }

    return { statusCode: 200, body: JSON.stringify({ numere }) };
  } catch (e) {
    return { statusCode: 500, body: JSON.stringify({ error: "Eroare la apelarea Anthropic API: " + e.message }) };
  }
};