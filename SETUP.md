# OCTAVIAN PERFORMANCE — Setup

## 1. Creează aplicația Strava

1. Mergi la: https://www.strava.com/settings/api
2. Completează:
   - **Application Name**: Octavian Performance
   - **Category**: Data Importer
   - **Website**: http://localhost:3000
   - **Authorization Callback Domain**: localhost
3. Copiază **Client ID** și **Client Secret**

---

## 2. Configurează Backend

```bash
cd training-app/backend

# Creează .env din exemplu
cp .env.example .env
```

Editează `.env`:
```
STRAVA_CLIENT_ID=12345          # ← Client ID-ul tău
STRAVA_CLIENT_SECRET=abc123...  # ← Client Secret-ul tău
STRAVA_REDIRECT_URI=http://localhost:8000/auth/callback
FRONTEND_URL=http://localhost:3000
```

```bash
# Instalează dependențele Python
python3 -m venv venv
source venv/bin/activate        # Pe Windows: venv\Scripts\activate
pip install -r requirements.txt

# Pornește backend-ul
uvicorn main:app --reload --port 8000
```

Backend disponibil la: http://localhost:8000

---

## 3. Configurează Frontend

```bash
cd training-app/frontend

# Creează .env.local din exemplu
cp .env.local.example .env.local

# Instalează și pornește
npm install
npm run dev
```

Frontend disponibil la: http://localhost:3000

---

## 4. Autentificare

1. Deschide http://localhost:3000
2. Click pe **Conectează Strava**
3. Autorizează aplicația pe pagina Strava
4. Ești redirecționat automat la dashboard

---

## Ce analizează aplicația

| Metric | Descriere |
|--------|-----------|
| CTL (Fitness) | Media exponențială pe 42 zile a TSS — fitness aerob acumulat |
| ATL (Oboseală) | Media exponențială pe 7 zile a TSS — stres acut recent |
| TSB (Formă) | CTL - ATL — pozitiv = odihnit, negativ = obosit |
| VO2max | Estimat din best pace la alergare (formula Daniels) |
| FTP | 95% din cea mai bună putere medie pe 20 min la ciclism |
| CSS | Critical Swim Speed — calculat din best 400m și 200m |
| Predicții | Formula Riegel pentru alergare, combined pentru triatlonuri |
