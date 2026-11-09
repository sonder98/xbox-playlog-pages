import fs from 'node:fs/promises';
import sharp from 'sharp';
import {XBOX_SPHERE_PATH} from '../src/xbox-brand-path.ts';

// Use the same official Xbox sphere silhouette as the Mythic card.
// Everything is rendered locally by Sharp; no remote image or font is fetched.
function iconSvg(maskable=false){
 const safeLayout=maskable?'translate(256 256) scale(.8) translate(-256 -256)':'';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#0f1210"/>
  <rect x="15" y="15" width="482" height="482" rx="110" fill="none" stroke="#28422e" stroke-width="3"/>
  <g transform="${safeLayout}">
   <circle cx="256" cy="212" r="131" fill="#107c10"/>
   <g transform="translate(145 101) scale(9.25)">
    <path d="${XBOX_SPHERE_PATH}" fill="#fff"/>
   </g>
   <rect x="183" y="355" width="146" height="4" rx="2" fill="#107c10"/>
   <text x="256" y="424" text-anchor="middle"
    font-family="Arial,Helvetica,sans-serif" font-size="39" font-weight="800"
    letter-spacing="1.4" fill="#fff">XBOX PLAYLOG</text>
  </g>
 </svg>`;
}

await fs.mkdir('public',{recursive:true});
const artwork=Buffer.from(iconSvg());
const maskedArtwork=Buffer.from(iconSvg(true));
// Keep old URLs for previously installed manifests and Safari shortcuts;
// versioned v3 names force new installations to pick up the Xbox branding.
const icons=[
 [192,'pwa-192.png',artwork],
 [512,'pwa-512.png',artwork],
 [180,'apple-touch-icon.png',artwork],
 [192,'pwa-192-v2.png',artwork],
 [512,'pwa-512-v2.png',artwork],
 [180,'apple-touch-icon-v2.png',artwork],
 [192,'pwa-192-v3.png',artwork],
 [512,'pwa-512-v3.png',artwork],
 [180,'apple-touch-icon-v3.png',artwork],
 [192,'pwa-maskable-192-v3.png',maskedArtwork],
 [512,'pwa-maskable-512-v3.png',maskedArtwork]
] as const;
await Promise.all(icons.map(async ([size,name,source])=>{
 await sharp(source).resize(size,size).png().toFile('public/'+name);
}));
console.log('Generated Xbox-branded PWA (any + maskable) and iOS icons');
