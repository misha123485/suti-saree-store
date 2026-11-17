SPEAK YOUR ADDRESS (AI voice) - kaise lagana hai
================================================
1. Zip ko C:\Users\bapan\suti-saree-store me extract karo, Replace / Yes to all.
2. PEHLE ZIP ki purani file ho to DELETE karo:
     components\checkout\voice-input-button.tsx   (ab nahi chahiye)
3. Command Prompt:
     cd C:\Users\bapan\suti-saree-store
     git add .
     git commit -m "Checkout: AI speak-your-address + admin control"
     git push
4. Vercel me GROQ_API_KEY pehle se laga ho (AI chat wala) to kuch aur nahi karna.
   SQL/migration ki zaroorat nahi.

Admin: Admin > Settings > "Checkout Voice Typing (Address)"

Files:
  REPLACE: app/checkout/page.tsx
  REPLACE: components/admin/settings-panel.tsx
  NEW: app/api/checkout/voice-address/route.ts
  NEW: components/checkout/voice-address-button.tsx
  NEW: components/admin/checkout-voice-panel.tsx
  NEW: lib/checkout-voice-settings.ts
