import fs from 'node:fs/promises';
import sharp from 'sharp';

// Neon-green Xbox game trail icon, shared by Android PWA and iOS home screen.
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
 <rect width="512" height="512" rx="114" fill="#0f0f0f"/>
 <rect x="34" y="34" width="444" height="444" rx="101" fill="#c7ff2e"/>
 <path d="M119 300c-6-44 9-91 48-112 35-19 59 3 89 3s54-22 89-3c39 21 54 68 48 112-3 24-19 43-40 38-24-5-43-32-70-32h-54c-27 0-46 27-70 32-21 5-37-14-40-38Z" fill="#141414"/>
 <path d="M187 236v56M159 264h56" fill="none" stroke="#c7ff2e" stroke-width="14" stroke-linecap="round"/>
 <circle cx="317" cy="246" r="12" fill="#c7ff2e"/>
 <circle cx="343" cy="275" r="12" fill="#c7ff2e"/>
 <path d="M172 383h48l22-23 25 25h73" fill="none" stroke="#141414" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;
await fs.mkdir('public',{recursive:true});
for(const [size,name] of [[192,'pwa-192.png'],[512,'pwa-512.png'],[180,'apple-touch-icon.png']] as const){
 await sharp(Buffer.from(svg)).resize(size,size).png().toFile('public/'+name);
}
console.log('Generated 192/512px PWA icons and iOS home-screen icon');
