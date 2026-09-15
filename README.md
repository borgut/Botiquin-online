# Botiquín

Inventario doméstico de medicamentos desde una sola foto. Gemini Vision detecta varias cajas y CIMA/AEMPS aporta la referencia oficial.

## Variables
- `GEMINI_API_KEY` — activa el análisis visual.
- `GEMINI_MODEL` — opcional; por defecto `gemini-2.5-flash`.

## Local
```bash
npm install
npm start
```

La información médica se presenta siempre como referencia al prospecto oficial y nunca como consejo personalizado.
