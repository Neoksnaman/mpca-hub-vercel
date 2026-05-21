/**
 * Custom illustrated SVG preset avatars inspired by Google Chrome's profile avatars.
 * Hand-crafted with modern gradients and high-fidelity geometries.
 */

const toDataUrl = (svg: string) => `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;

// 1. Origami Cat
const catSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#E0F2FE"/>
  <g transform="translate(10, 10) scale(0.8)">
    <polygon points="20,30 35,45 15,50" fill="#94A3B8"/>
    <polygon points="80,30 65,45 85,50" fill="#64748B"/>
    <polygon points="50,75 15,50 35,45" fill="#CBD5E1"/>
    <polygon points="50,75 85,50 65,45" fill="#94A3B8"/>
    <polygon points="50,35 35,45 50,75" fill="#F1F5F9"/>
    <polygon points="50,35 65,45 50,75" fill="#E2E8F0"/>
    <polygon points="50,68 45,62 55,62" fill="#475569"/>
  </g>
</svg>
`;

// 2. Origami Dog
const dogSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#FEF08A"/>
  <g transform="translate(10, 10) scale(0.8)">
    <polygon points="15,30 35,30 25,60" fill="#EA580C"/>
    <polygon points="85,30 65,30 75,60" fill="#C2410C"/>
    <polygon points="35,30 65,30 50,65" fill="#F97316"/>
    <polygon points="35,30 50,65 25,60" fill="#DD6B20"/>
    <polygon points="65,30 50,65 75,60" fill="#C05621"/>
    <polygon points="50,65 40,75 50,85" fill="#FEE2E2"/>
    <polygon points="50,65 60,75 50,85" fill="#FCA5A5"/>
    <polygon points="50,65 44,70 56,70" fill="#1E293B"/>
  </g>
</svg>
`;

// 3. Origami Dragon
const dragonSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#E5E7EB"/>
  <g transform="translate(10, 10) scale(0.8)">
    <polygon points="50,20 30,45 50,55" fill="#059669"/>
    <polygon points="50,20 70,45 50,55" fill="#047857"/>
    <polygon points="30,45 15,65 50,55" fill="#10B981"/>
    <polygon points="70,45 85,65 50,55" fill="#059669"/>
    <polygon points="50,55 35,80 50,70" fill="#34D399"/>
    <polygon points="50,55 65,80 50,70" fill="#10B981"/>
    <polygon points="50,20 50,55 55,40" fill="#A7F3D0"/>
  </g>
</svg>
`;

// 4. Origami Elephant
const elephantSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#FBCFE8"/>
  <g transform="translate(10, 10) scale(0.8)">
    <polygon points="50,30 20,40 35,65" fill="#2563EB"/>
    <polygon points="50,30 80,40 65,65" fill="#1D4ED8"/>
    <polygon points="35,65 50,30 50,75" fill="#3B82F6"/>
    <polygon points="65,65 50,30 50,75" fill="#2563EB"/>
    <polygon points="50,75 42,85 50,80" fill="#60A5FA"/>
    <polygon points="50,75 58,85 50,80" fill="#3B82F6"/>
  </g>
</svg>
`;

// 5. Origami Fox
const foxSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#FFEDD5"/>
  <g transform="translate(10, 10) scale(0.8)">
    <polygon points="50,55 15,25 35,55" fill="#EA580C"/>
    <polygon points="50,55 85,25 65,55" fill="#C2410C"/>
    <polygon points="50,80 35,55 50,55" fill="#F97316"/>
    <polygon points="50,80 65,55 50,55" fill="#EA580C"/>
    <polygon points="50,80 35,55 15,65" fill="#FDBA74"/>
    <polygon points="50,80 65,55 85,65" fill="#F97316"/>
    <polygon points="50,80 46,75 54,75" fill="#1E293B"/>
  </g>
</svg>
`;

// 6. Origami Crane
const craneSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#BFDBFE"/>
  <g transform="translate(10, 10) scale(0.8)">
    <polygon points="50,20 30,55 50,50" fill="#DB2777"/>
    <polygon points="50,20 70,55 50,50" fill="#C026D3"/>
    <polygon points="30,55 10,40 50,50" fill="#EC4899"/>
    <polygon points="70,55 90,40 50,50" fill="#D946EF"/>
    <polygon points="50,50 40,80 50,65" fill="#F472B6"/>
    <polygon points="50,50 60,80 50,65" fill="#EC4899"/>
  </g>
</svg>
`;

// 7. Origami Rabbit
const rabbitSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#CCFBF1"/>
  <g transform="translate(10, 10) scale(0.8)">
    <polygon points="35,15 45,40 30,35" fill="#E2E8F0"/>
    <polygon points="65,15 55,40 70,35" fill="#CBD5E1"/>
    <polygon points="45,40 55,40 50,75" fill="#F1F5F9"/>
    <polygon points="45,40 30,55 50,75" fill="#E2E8F0"/>
    <polygon points="55,40 70,55 50,75" fill="#CBD5E1"/>
    <polygon points="50,75 45,80 55,80" fill="#FCA5A5"/>
  </g>
</svg>
`;

// 8. Basketball
const basketballSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#CFE2FF"/>
  <g transform="translate(15, 15) scale(0.7)">
    <circle cx="50" cy="50" r="48" fill="#F97316" stroke="#1E293B" stroke-width="4"/>
    <path d="M 16 16 Q 50 50 16 84" fill="none" stroke="#1E293B" stroke-width="4"/>
    <path d="M 84 16 Q 50 50 84 84" fill="none" stroke="#1E293B" stroke-width="4"/>
    <line x1="2" y1="50" x2="98" y2="50" stroke="#1E293B" stroke-width="4"/>
    <line x1="50" y1="2" x2="50" y2="98" stroke="#1E293B" stroke-width="4"/>
  </g>
</svg>
`;

// 9. Avocado
const avocadoSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#F3E8FF"/>
  <g transform="translate(20, 15) scale(0.6 0.7)">
    <path d="M 50 10 C 25 10, 15 50, 15 70 C 15 90, 85 90, 85 70 C 85 50, 75 10, 50 10 Z" fill="#15803D" stroke="#14532D" stroke-width="4"/>
    <path d="M 50 18 C 30 18, 22 52, 22 70 C 22 84, 78 84, 78 70 C 78 52, 70 18, 50 18 Z" fill="#4ADE80"/>
    <path d="M 50 25 C 35 25, 28 54, 28 70 C 28 80, 72 80, 72 70 C 72 54, 65 25, 50 25 Z" fill="#D9F99D"/>
    <circle cx="50" cy="65" r="14" fill="#78350F" stroke="#451A03" stroke-width="2"/>
  </g>
</svg>
`;

// 10. Watermelon
const watermelonSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#D1FAE5"/>
  <g transform="translate(15, 15) scale(0.7)">
    <path d="M 10 50 A 40 40 0 0 0 90 50 Z" fill="#EF4444" stroke="#15803D" stroke-width="8"/>
    <path d="M 10 50 A 40 40 0 0 0 90 50" fill="none" stroke="#FFFFFF" stroke-width="4"/>
    <circle cx="30" cy="62" r="2.5" fill="#1E293B"/>
    <circle cx="42" cy="72" r="2.5" fill="#1E293B"/>
    <circle cx="58" cy="72" r="2.5" fill="#1E293B"/>
    <circle cx="70" cy="62" r="2.5" fill="#1E293B"/>
    <circle cx="50" cy="58" r="2.5" fill="#1E293B"/>
  </g>
</svg>
`;

// 11. Pizza Slice
const pizzaSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#FEF3C7"/>
  <g transform="translate(15, 12) scale(0.7 0.8)">
    <polygon points="50,90 20,25 80,25" fill="#FBBF24" stroke="#D97706" stroke-width="4" stroke-linejoin="round"/>
    <path d="M 16 25 Q 50 15 84 25" fill="none" stroke="#92400E" stroke-width="8" stroke-linecap="round"/>
    <circle cx="40" cy="40" r="6" fill="#EF4444"/>
    <circle cx="60" cy="45" r="6" fill="#EF4444"/>
    <circle cx="48" cy="65" r="6" fill="#EF4444"/>
    <circle cx="34" cy="55" r="3" fill="#22C55E"/>
    <circle cx="64" cy="32" r="3" fill="#22C55E"/>
    <circle cx="52" cy="30" r="3" fill="#22C55E"/>
  </g>
</svg>
`;

// 12. Sushi
const sushiSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#ECFEFF"/>
  <g transform="translate(10, 10) scale(0.8)">
    <rect x="15" y="35" width="30" height="30" rx="8" fill="#1F2937" stroke="#111827" stroke-width="3"/>
    <circle cx="30" cy="50" r="10" fill="#F9FAFB"/>
    <circle cx="30" cy="50" r="5" fill="#F97316"/>
    <rect x="52" y="42" width="32" height="20" rx="6" fill="#F9FAFB" stroke="#E5E7EB" stroke-width="2"/>
    <path d="M 50 42 Q 68 30 86 42 L 86 48 Q 68 38 50 48 Z" fill="#EF4444" stroke="#DC2626" stroke-width="2"/>
    <rect x="62" y="38" width="10" height="26" fill="#10B981" opacity="0.8"/>
  </g>
</svg>
`;

// 13. Ramen
const ramenSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#CFFAFE"/>
  <g transform="translate(15, 15) scale(0.7)">
    <path d="M 10 50 A 40 40 0 0 0 90 50 Z" fill="#F43F5E" stroke="#E11D48" stroke-width="4"/>
    <rect x="20" y="50" width="60" height="6" fill="#FBBF24"/>
    <circle cx="38" cy="38" r="10" fill="#FFFFFF"/>
    <circle cx="38" cy="38" r="5" fill="#F59E0B"/>
    <line x1="8" y1="25" x2="88" y2="40" stroke="#78350F" stroke-width="3" stroke-linecap="round"/>
    <line x1="8" y1="32" x2="88" y2="45" stroke="#78350F" stroke-width="3" stroke-linecap="round"/>
    <path d="M 22 50 C 25 35 30 35 35 50" fill="none" stroke="#FBBF24" stroke-width="3"/>
    <path d="M 50 50 C 55 35 60 35 65 50" fill="none" stroke="#FBBF24" stroke-width="3"/>
  </g>
</svg>
`;

// 14. Vinyl Record
const recordSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#DBEAFE"/>
  <g transform="translate(15, 15) scale(0.7)">
    <circle cx="50" cy="50" r="46" fill="#111827"/>
    <circle cx="50" cy="50" r="40" fill="none" stroke="#374151" stroke-width="1"/>
    <circle cx="50" cy="50" r="32" fill="none" stroke="#374151" stroke-width="1"/>
    <circle cx="50" cy="50" r="24" fill="none" stroke="#374151" stroke-width="1"/>
    <circle cx="50" cy="50" r="16" fill="#EC4899"/>
    <circle cx="50" cy="50" r="4" fill="#DBEAFE"/>
  </g>
</svg>
`;

// 15. Ice Cream
const iceCreamSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#FFE4E6"/>
  <g transform="translate(20, 10) scale(0.6 0.8)">
    <polygon points="50,95 25,50 75,50" fill="#D97706" stroke="#B45309" stroke-width="3"/>
    <line x1="33" y1="65" x2="67" y2="65" stroke="#B45309" stroke-width="1.5"/>
    <line x1="41" y1="80" x2="59" y2="80" stroke="#B45309" stroke-width="1.5"/>
    <circle cx="50" cy="42" r="22" fill="#F43F5E"/>
    <circle cx="38" cy="46" r="12" fill="#FB7185"/>
    <circle cx="62" cy="46" r="12" fill="#FB7185"/>
    <circle cx="50" cy="25" r="14" fill="#F472B6"/>
    <circle cx="50" cy="12" r="6" fill="#BE123C"/>
    <path d="M 50 12 Q 58 2 64 6" fill="none" stroke="#BE123C" stroke-width="2"/>
  </g>
</svg>
`;

// 16. Bicycle
const bicycleSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#DBEAFE"/>
  <g transform="translate(15, 20) scale(0.7)">
    <circle cx="20" cy="50" r="16" fill="none" stroke="#1E293B" stroke-width="5"/>
    <circle cx="80" cy="50" r="16" fill="none" stroke="#1E293B" stroke-width="5"/>
    <circle cx="50" cy="50" r="6" fill="none" stroke="#1E293B" stroke-width="4"/>
    <polygon points="20,50 50,50 68,22 38,22" fill="none" stroke="#3B82F6" stroke-width="5" stroke-linejoin="round"/>
    <line x1="50" y1="50" x2="38" y2="22" stroke="#3B82F6" stroke-width="5"/>
    <line x1="80" y1="50" x2="68" y2="22" stroke="#3B82F6" stroke-width="5"/>
    <line x1="68" y1="22" x2="74" y2="10" stroke="#1E293B" stroke-width="4"/>
    <line x1="74" y1="10" x2="82" y2="10" stroke="#1E293B" stroke-width="4"/>
    <line x1="38" y1="22" x2="32" y2="22" stroke="#1E293B" stroke-width="4"/>
  </g>
</svg>
`;

// 17. Tamagotchi
const tamagotchiSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#FFEDD5"/>
  <g transform="translate(20, 15) scale(0.6 0.7)">
    <rect x="10" y="10" width="80" height="85" rx="35" fill="#F59E0B" stroke="#D97706" stroke-width="5"/>
    <rect x="22" y="22" width="56" height="42" rx="10" fill="#ECFDF5" stroke="#1E293B" stroke-width="4"/>
    <circle cx="34" cy="78" r="6" fill="#EF4444"/>
    <circle cx="50" cy="84" r="6" fill="#3B82F6"/>
    <circle cx="66" cy="78" r="6" fill="#10B981"/>
    <rect x="44" y="36" width="12" height="12" rx="2" fill="#1E293B"/>
    <line x1="42" y1="48" x2="44" y2="48" stroke="#1E293B" stroke-width="2"/>
    <line x1="56" y1="48" x2="58" y2="48" stroke="#1E293B" stroke-width="2"/>
  </g>
</svg>
`;

// 18. Cheese
const cheeseSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#FAF5FF"/>
  <g transform="translate(15, 15) scale(0.7)">
    <path d="M 15 70 L 85 70 L 75 30 L 15 45 Z" fill="#FBBF24" stroke="#D97706" stroke-width="4" stroke-linejoin="round"/>
    <path d="M 15 45 L 75 30 L 50 15 Z" fill="#FCD34D" stroke="#D97706" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="30" cy="56" r="5" fill="#FAF5FF" stroke="#D97706" stroke-width="2"/>
    <circle cx="55" cy="52" r="6" fill="#FAF5FF" stroke="#D97706" stroke-width="2"/>
    <circle cx="42" cy="38" r="4" fill="#FAF5FF" stroke="#D97706" stroke-width="2"/>
    <circle cx="68" cy="46" r="3" fill="#FAF5FF" stroke="#D97706" stroke-width="2"/>
  </g>
</svg>
`;

// 19. Onigiri
const onigiriSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#FEF08A"/>
  <g transform="translate(15, 15) scale(0.7)">
    <path d="M 50 12 L 86 74 C 90 80, 84 86, 76 86 L 24 86 C 16 86, 10 80, 14 74 Z" fill="#F9FAFB" stroke="#E5E7EB" stroke-width="4" stroke-linejoin="round"/>
    <path d="M 38 66 L 62 66 L 58 86 L 42 86 Z" fill="#1F2937" rx="4"/>
    <circle cx="42" cy="45" r="2.5" fill="#EF4444"/>
    <circle cx="58" cy="45" r="2.5" fill="#EF4444"/>
  </g>
</svg>
`;

// 20. Sandwich
const sandwichSvg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <circle cx="50" cy="50" r="50" fill="#DBEAFE"/>
  <g transform="translate(15, 15) scale(0.7)">
    <path d="M 12 40 L 50 12 L 88 40 L 80 84 L 20 84 Z" fill="#D97706" stroke="#92400E" stroke-width="4" stroke-linejoin="round"/>
    <path d="M 16 42 L 50 17 L 84 42 L 76 80 L 24 80 Z" fill="#FEF3C7"/>
    <path d="M 10 52 C 20 48 25 60 35 52 C 45 48 55 60 65 52 C 75 48 80 60 90 52" fill="none" stroke="#22C55E" stroke-width="6" stroke-linecap="round"/>
    <rect x="22" y="60" width="56" height="6" rx="3" fill="#EF4444"/>
    <rect x="26" y="66" width="48" height="6" rx="3" fill="#FBBF24"/>
  </g>
</svg>
`;

export interface ChromeAvatarPreset {
  id: string;
  name: string;
  category: 'Origami' | 'Food' | 'Activity';
  url: string;
}

export const CHROME_PRESET_AVATARS: ChromeAvatarPreset[] = [
  { id: 'cat', name: 'Origami Cat', category: 'Origami', url: toDataUrl(catSvg) },
  { id: 'dog', name: 'Origami Dog', category: 'Origami', url: toDataUrl(dogSvg) },
  { id: 'dragon', name: 'Origami Dragon', category: 'Origami', url: toDataUrl(dragonSvg) },
  { id: 'elephant', name: 'Origami Elephant', category: 'Origami', url: toDataUrl(elephantSvg) },
  { id: 'fox', name: 'Origami Fox', category: 'Origami', url: toDataUrl(foxSvg) },
  { id: 'crane', name: 'Origami Crane', category: 'Origami', url: toDataUrl(craneSvg) },
  { id: 'rabbit', name: 'Origami Rabbit', category: 'Origami', url: toDataUrl(rabbitSvg) },
  { id: 'basketball', name: 'Basketball', category: 'Activity', url: toDataUrl(basketballSvg) },
  { id: 'avocado', name: 'Avocado', category: 'Food', url: toDataUrl(avocadoSvg) },
  { id: 'watermelon', name: 'Watermelon', category: 'Food', url: toDataUrl(watermelonSvg) },
  { id: 'pizza', name: 'Pizza', category: 'Food', url: toDataUrl(pizzaSvg) },
  { id: 'sushi', name: 'Sushi', category: 'Food', url: toDataUrl(sushiSvg) },
  { id: 'ramen', name: 'Ramen Bowl', category: 'Food', url: toDataUrl(ramenSvg) },
  { id: 'record', name: 'Vinyl Record', category: 'Activity', url: toDataUrl(recordSvg) },
  { id: 'icecream', name: 'Ice Cream', category: 'Food', url: toDataUrl(iceCreamSvg) },
  { id: 'bicycle', name: 'Bicycle', category: 'Activity', url: toDataUrl(bicycleSvg) },
  { id: 'tamagotchi', name: 'Tamagotchi', category: 'Activity', url: toDataUrl(tamagotchiSvg) },
  { id: 'cheese', name: 'Swiss Cheese', category: 'Food', url: toDataUrl(cheeseSvg) },
  { id: 'onigiri', name: 'Onigiri Rice Ball', category: 'Food', url: toDataUrl(onigiriSvg) },
  { id: 'sandwich', name: 'Club Sandwich', category: 'Food', url: toDataUrl(sandwichSvg) },
];
