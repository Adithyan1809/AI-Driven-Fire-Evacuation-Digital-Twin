import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
env.split(/\r?\n/).forEach(l => {
  const [k, v] = l.split('=');
  if (k && v) process.env[k.trim()] = v.trim();
});

const apiKey = process.env.GEMINI_API_KEY;

const candidateModels = [
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
  'gemini-3.6-flash',
];

for (const model of candidateModels) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const body = {
    contents: [{ role: 'user', parts: [{ text: 'Map BMS "AIML-LAB-A" to {"target_entity":"ROOM_101"}' }] }],
    generationConfig: { responseMimeType: 'application/json' }
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    console.log(`Model [${model}] -> Status:`, res.status);
    if (res.status === 200) {
      const d = await res.json();
      console.log(`  Success from ${model}:`, d.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 80));
    } else {
      const err = await res.json();
      console.log(`  Error (${model}):`, err.error?.message?.slice(0, 100));
    }
  } catch (e) {
    console.error(`  Network error for ${model}:`, e.message);
  }
}
