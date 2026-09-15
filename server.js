import express from 'express';
import multer from 'multer';

const app = express();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024, files: 1 } });
app.use(express.static('public'));
app.use(express.json());

const CIMA = 'https://cima.aemps.es/cima/rest';

function stripHtml(s = '') {
  return String(s).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function cimaSearch(name) {
  const q = encodeURIComponent(name.trim());
  const res = await fetch(`${CIMA}/medicamentos?nombre=${q}`);
  if (!res.ok) return null;
  const data = await res.json();
  const hit = data.resultados?.[0];
  if (!hit) return null;
  let detail = hit;
  try {
    const d = await fetch(`${CIMA}/medicamento?nregistro=${encodeURIComponent(hit.nregistro)}`);
    if (d.ok) detail = { ...hit, ...(await d.json()) };
  } catch {}
  return {
    nregistro: detail.nregistro,
    nombre: detail.nombre,
    laboratorio: detail.labtitular,
    forma: detail.formaFarmaceutica?.nombre || detail.formaFarmaceutica,
    dosis: detail.dosis,
    receta: detail.receta,
    prospecto: detail.docs?.find(x => x.tipo === 2)?.urlHtml || detail.docs?.find(x => x.tipo === 2)?.url || null,
    fichaTecnica: detail.docs?.find(x => x.tipo === 1)?.urlHtml || detail.docs?.find(x => x.tipo === 1)?.url || null,
    fuente: `https://cima.aemps.es/cima/publico/detalle.html?nregistro=${encodeURIComponent(detail.nregistro)}`
  };
}

app.get('/api/status', (_req, res) => res.json({ vision: Boolean(process.env.GEMINI_API_KEY), source: 'CIMA · AEMPS' }));

app.get('/api/cima', async (req, res) => {
  if (!req.query.nombre) return res.status(400).json({ error: 'Falta el nombre.' });
  try { res.json({ result: await cimaSearch(String(req.query.nombre)) }); }
  catch { res.status(502).json({ error: 'CIMA no está disponible ahora.' }); }
});

app.post('/api/analyze', upload.single('photo'), async (req, res) => {
  if (!process.env.GEMINI_API_KEY) return res.status(503).json({ error: 'La visión aún no está activada.', code: 'VISION_OFF' });
  if (!req.file) return res.status(400).json({ error: 'Añade una foto.' });
  try {
    const prompt = `Analiza esta foto de un botiquín doméstico en España. Identifica todas las cajas de medicamentos visibles. No inventes texto oculto ni datos médicos. Devuelve SOLO JSON válido con esta forma: {"items":[{"name":"nombre comercial legible","brand":"laboratorio o marca si es legible, si no null","presentation":"dosis y formato legibles, si no null","confidence":"alta|media|baja","needsExtraPhoto":true|false}]}. Separa cajas distintas. needsExtraPhoto debe ser true si el nombre o la presentación no son inequívocos. No incluyas dosis recomendadas ni indicaciones clínicas: eso se resolverá después contra la fuente oficial CIMA.`;
    const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
    const gr = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: req.file.mimetype, data: req.file.buffer.toString('base64') } }] }],
        generationConfig: { responseMimeType: 'application/json', temperature: 0.1 }
      })
    });
    if (!gr.ok) throw new Error(`Gemini ${gr.status}`);
    const gj = await gr.json();
    const text = gj.candidates?.[0]?.content?.parts?.[0]?.text || '{"items":[]}';
    const parsed = JSON.parse(text.replace(/^```json\s*|\s*```$/g, ''));
    const enriched = await Promise.all((parsed.items || []).slice(0, 30).map(async item => ({ ...item, cima: await cimaSearch(item.name) })));
    res.json({ items: enriched, disclaimer: 'Información del prospecto oficial. No sustituye el consejo de un profesional sanitario.' });
  } catch (e) {
    console.error(e);
    res.status(502).json({ error: 'No hemos podido leer la foto. Prueba con más luz y las cajas de frente.' });
  }
});

app.get('*', (_req, res) => res.sendFile(new URL('./public/index.html', import.meta.url).pathname));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Botiquín en http://localhost:${port}`));
