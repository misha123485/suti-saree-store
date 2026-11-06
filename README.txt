Replace karo (project root me extract):
  components/providers.tsx                    (sirf 1 line badli: Toaster import)
  components/coupon-celebration-toaster.tsx   (nayi)
  components/coupon-celebration.css           (nayi)
Agar providers.tsx tumne pehle edit ki hai to replace mat karo, bas us file me ye ek line badlo:
  import { Toaster } from 'sonner';   -->   import { Toaster } from './coupon-celebration-toaster';
