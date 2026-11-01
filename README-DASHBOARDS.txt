ANALYTICS DASHBOARDS - kaise apply karein
==========================================
1) Is zip ke andar ke folders (app, components, lib) ko apne C:\Users\bapan\suti-saree-store me
   copy karke "Replace" kar dein.
2) Terminal me:
     git add .
     git commit -m "Analytics dashboards with settings"
     git push
3) Koi SQL migration / naya package / naya env variable NAHI chahiye.
   Settings existing `settings` table me key `analytics_dashboards` ke andar save hoti hai.

Kahan dikhega: Admin > Analytics > "Dashboards" tab (ab yahi pehla tab hai).
Kaunsa dikhana hai: Dashboards tab me "Choose dashboards" button -> toggle ON/OFF -> Save.

Files:
  NEW      lib/dashboards-config.ts
  NEW      app/api/admin/dashboards/route.ts
  NEW      components/admin/dashboards/primitives.tsx
  NEW      components/admin/dashboards/dashboards.tsx
  NEW      components/admin/dashboards/dashboards-tab.tsx
  CHANGED  components/admin/analytics-panel.tsx   (sirf Dashboards tab add hua)
