SPEAK TO FILL (AI voice assistant) - update
===========================================
1. Zip ko C:\Users\bapan\suti-saree-store me extract karo (Replace / Yes to all).
2. PURANI FILE DELETE KARO (ab nahi chahiye, build fail karegi):
     components\checkout\voice-address-button.tsx
3. Command Prompt:
     cd C:\Users\bapan\suti-saree-store
     git add -A
     git commit -m "Checkout: guided AI voice assistant"
     git push
4. GROQ_API_KEY Vercel me lagi honi chahiye (Production) + Redeploy.

Admin: Settings > "Checkout Voice Assistant (Speak to Fill)"

Files:
  REPLACE: app/checkout/page.tsx
  REPLACE: app/api/checkout/voice-address/route.ts
  REPLACE: lib/checkout-voice-settings.ts
  REPLACE: components/admin/checkout-voice-panel.tsx
  REPLACE: components/admin/settings-panel.tsx
  NEW:     components/checkout/voice-assistant.tsx
  DELETE:  components/checkout/voice-address-button.tsx
