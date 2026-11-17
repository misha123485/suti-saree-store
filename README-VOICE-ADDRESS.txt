VOICE ADDRESS (checkout mic button) - kaise lagana hai
=====================================================
1. Is zip ko suti-saree-store folder me extract karo, "Replace" / "Yes to all" dabao.
2. Command Prompt me:
     cd C:\Users\bapan\suti-saree-store
     git add .
     git commit -m "Checkout: voice-to-text address + admin control"
     git push
3. SQL / migration ki zaroorat NAHI hai (purani `settings` table use hoti hai).

Admin: Admin > Settings > "Checkout Voice Typing (Address)"
  - ON/OFF, default language (English-India / Hindi / Bengali)
  - language switcher button, aur kaun se fields me mic dikhe.

Files (2 replace, 3 naye):
  REPLACE: app/checkout/page.tsx
  REPLACE: components/admin/settings-panel.tsx
  NEW:     components/checkout/voice-input-button.tsx
  NEW:     components/admin/checkout-voice-panel.tsx
  NEW:     lib/checkout-voice-settings.ts
