# 🎙️ Personal Voice Interview Bot

A premium, interactive, and voice-enabled web application that allows users to ask professional questions and hear replies in the first person representing the candidate. Built using **React, TypeScript, Tailwind CSS**, and powered by **Cloudflare Pages Functions** and the **Gemini 2.5 Flash API**.

---

## ✨ Features

- **🗣️ Speech-to-Text**: Click the circular microphone and speak. Uses browser Web Speech API `SpeechRecognition` to instantly transcribe in real-time.
- **🔊 Text-to-Speech**: Seamless, high-quality audio responses using the browser's `SpeechSynthesis` API.
- **🎙️ Voice Customization**: An active dropdown listing all available English system voices on your device, enabling a personalized listening experience.
- **📱 Text Fallback**: An elegant manual text field allows fully-featured interaction for users without microphones or on unsupported browsers.
- **🎨 Modern Premium UI**: Designed with a sleek dark slate background, translucent glassmorphism cards, glowing status waves, and equalizer voice waveforms.
- **⚡ Interactive Chips**: Tap pre-loaded candidate profile chips (Life Story, Superpower, Growth Areas, Coworker Misconceptions, Limits) to immediately trigger bot replies.
- **🔒 Backend Proxy API**: Cloudflare Pages Function proxying requests to Gemini securely, hiding your `GEMINI_API_KEY` from the frontend completely.

---

## 🛠️ Local Development

Follow these steps to run the project locally.

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- A **Gemini API Key** (Get one for free at [Google AI Studio](https://aistudio.google.com/))

### 1. Installation
Clone or navigate to the directory and run:
```bash
npm install
```

### 2. Running Locally (Frontend)
Run the Vite development server:
```bash
npm run dev
```
Open [http://localhost:5173/](http://localhost:5173/) in your browser.

> [!NOTE]
> Since the backend proxy `/api/chat` is a Cloudflare Pages Function, standard Vite dev server does not serve it natively without running a proxy or using Wrangler. For complete local testing of the frontend and backend together, use **Wrangler** (the official Cloudflare CLI).

### 3. Running with Wrangler (Full-Stack Local Testing)
To test both frontend and backend functions locally:
```bash
# Run the application through Wrangler Pages emulator
npx wrangler pages dev dist --compatibility-date=2024-01-01 --binding GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
```
Or build the assets first, then start wrangler:
```bash
npm run build
npx wrangler pages dev dist --binding GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
```

---

## 🚀 Cloudflare Pages Deployment Steps

Follow these exact steps to publish your bot live on a free `.pages.dev` subdomain:

1. **Create a GitHub Repository**:
   - Go to [GitHub](https://github.com/) and create a new public or private repository.
2. **Push the Project**:
   - Initialize git in your project directory:
     ```bash
     git init
     git add .
     git commit -m "Initial commit: Personal Voice Interview Bot"
     git branch -M main
     git remote add origin <your-github-repo-url>
     git push -u origin main
     ```
3. **Go to Cloudflare Dashboard**:
   - Log in to your [Cloudflare Dashboard](https://dash.cloudflare.com/).
4. **Create Pages Project**:
   - Go to **Workers & Pages** in the left sidebar.
   - Click **Create** and select **Pages** -> **Connect to Git**.
5. **Connect GitHub Repo**:
   - Choose your GitHub account and select your repository. Click **Begin setup**.
6. **Configure Build Settings**:
   - **Framework Preset**: `Vite` (or None)
   - **Build Command**: `npm run build`
   - **Build Output Directory**: `dist`
7. **Add Environment Variable**:
   - Scroll down to the **Environment variables (advanced)** section.
   - Add a new variable:
     - **Variable name**: `GEMINI_API_KEY`
     - **Value**: *[Paste your Gemini API key from Google AI Studio]*
8. **Deploy**:
   - Click **Save and Deploy**. Cloudflare will compile your React site and compile the `functions/api/chat.ts` API endpoint automatically.
9. **Access Your Live App**:
   - Once complete, Cloudflare will provide a production URL (e.g., `https://personal-voice-bot.pages.dev`).
10. **Submit**:
    - Copy your live pages.dev URL and submit it!

---

## 📂 Project Structure

```text
├── functions/
│   └── api/
│       └── chat.ts       # Cloudflare Pages Function (Backend API Proxy)
├── src/
│   ├── assets/           # Scaffolded logos and assets
│   ├── App.css           # Cleared default styles
│   ├── App.tsx           # Main Application Component (UI & Voice Logic)
│   ├── index.css         # Tailwind directives & premium animations
│   └── main.tsx          # React application entrypoint
├── index.html            # Main HTML layout, fonts, and meta SEO
├── tailwind.config.js    # Tailwind scanner & transition specs
├── postcss.config.js     # PostCSS setup
├── package.json          # Node dependencies
└── README.md             # This guide
```

---

## 🎙️ Voice Persona Reference

The bot answers as if it is me, based on the following professional profile:
- **Story**: Technical background in Electronics & Communication Engineering; built useful applied AI systems (face recognition, tutoring, translation, prompt governance). Transitioning into management & supply chain to merge tech with execution.
- **Superpower**: High-speed execution. Taking ambiguous inputs, dividing them into modules, and building working prototypes rapidly.
- **Growth Areas**: (1) Structured business-friendly communication, (2) Strategic decision-making in management/product, and (3) Long-term consistency/focus.
- **Misconception**: Coworkers may think I do too much at once. However, I explore widely to learn fast but dive extremely deep to deliver when it matters.
- **Boundary Pushing**: Taking projects slightly above my skill level and mastering them under pressure.
