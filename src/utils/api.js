// API key is loaded from environment variables
const apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";

export const callGemini = async (prompt) => {
  if (!apiKey) {
    return "Gemini API key not configured. Please set VITE_GEMINI_API_KEY in your .env file.";
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    });
    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text || "No analysis available.";
  } catch (error) {
    return "AI Connection Failed.";
  }
};


