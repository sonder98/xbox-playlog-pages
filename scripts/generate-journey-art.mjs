/** Build four crisp, thematic 1920×1080 WebP journey backgrounds from original SVG art.
 * Kept deterministic and local: no network calls, user images, or external assets.
 * Run before Vite so each card can load a separately optimized, high-resolution image.
 */
import sharp from 'sharp';
import {mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';

const outDir=fileURLToPath(new URL('../src/assets/journey/',import.meta.url));
const W=1920,H=1080;
function common(kind,scene,accent='#107c10'){
 const seed=kind==='night'?'#161d36':kind==='burst'?'#173123':kind==='rare'?'#293021':'#15302a';
 return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 1920 1080">
 <defs>
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#0a1419"/><stop offset=".55" stop-color="${seed}"/><stop offset="1" stop-color="#091012"/></linearGradient>
  <linearGradient id="mist" x1="0" y1="0" x2="1" y2="0"><stop stop-color="#0a1012"/><stop offset=".47" stop-color="#0a1012" stop-opacity=".45"/><stop offset="1" stop-color="#0a1012" stop-opacity="0"/></linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#304c4a"/><stop offset=".6" stop-color="#112628"/><stop offset="1" stop-color="#081418"/></linearGradient>
  <linearGradient id="neon" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#A5EAAA"/><stop offset=".4" stop-color="${accent}"/><stop offset="1" stop-color="#41b698"/></linearGradient>
  <linearGradient id="gold" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#fff8c4"/><stop offset=".5" stop-color="#deb954"/><stop offset="1" stop-color="#997434"/></linearGradient>
  <linearGradient id="spot" x1=".5" y1="0" x2=".5" y2="1"><stop stop-color="#77C87E" stop-opacity=".4"/><stop offset="1" stop-color="#107c10" stop-opacity="0"/></linearGradient>
  <radialGradient id="aura"><stop stop-color="${accent}" stop-opacity=".25"/><stop offset=".65" stop-color="${accent}" stop-opacity=".07"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
  <filter id="glow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="20"/></filter>
  <filter id="smallglow" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="6"/></filter>
  <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#8eb29b" stroke-width="1" opacity=".12"/></pattern>
  <pattern id="checker" width="100" height="100" patternUnits="userSpaceOnUse"><rect width="50" height="50" fill="#80D288"/><rect x="50" y="50" width="50" height="50" fill="#80D288"/><rect x="50" width="50" height="50" fill="#183b29"/><rect y="50" width="50" height="50" fill="#183b29"/></pattern>
 </defs>
 <rect width="1920" height="1080" fill="url(#bg)"/>
 <rect x="540" width="1380" height="1080" fill="url(#grid)" opacity=".5"/>
 <circle cx="1420" cy="490" r="750" fill="url(#aura)"/>
 ${scene}
 <rect width="1920" height="1080" fill="url(#mist)" opacity=".7"/>
 <rect x="0" y="0" width="1920" height="1080" fill="none" stroke="#107c10" stroke-opacity=".1" stroke-width="4"/>
 </svg>`;
}

const night=common('night',`
 <!-- A moonlit city skyline and a clearly readable late-night clock. -->
 <circle cx="1530" cy="250" r="185" fill="#e5f0ca" opacity=".85"/>
 <circle cx="1604" cy="207" r="181" fill="#19243b"/>
 <circle cx="1530" cy="250" r="210" fill="none" stroke="#c9e9c9" stroke-opacity=".22" stroke-width="4"/>
 <path d="M0 815 760 812 760 610 857 610 857 730 970 730 970 503 1080 503 1080 660 1165 660 1165 390 1308 390 1308 603 1410 603 1410 494 1535 494 1535 692 1620 692 1620 452 1798 452 1798 665 1920 665 1920 1080 0 1080Z" fill="#07161d"/>
 <path d="M0 925 950 911 950 790 1070 790 1070 830 1190 830 1190 680 1360 680 1360 833 1510 833 1510 721 1700 721 1700 770 1920 770 1920 1080 0 1080Z" fill="#10242d"/>
 <g fill="#65BF6C" opacity=".67">
  <rect x="1190" y="425" width="20" height="12"/><rect x="1241" y="460" width="20" height="12"/><rect x="1190" y="506" width="20" height="12"/>
  <rect x="1660" y="486" width="19" height="15"/><rect x="1738" y="562" width="19" height="15"/><rect x="1660" y="605" width="19" height="15"/>
  <rect x="1010" y="554" width="16" height="14"/><rect x="1010" y="591" width="16" height="14"/>
 </g>
 <g stroke="#61d5c9" stroke-opacity=".5" stroke-width="4">
  <path d="M885 1000H1910M1020 920H1750M1180 870H1760" fill="none"/>
 </g>
 <g transform="translate(1290 505)">
  <circle r="207" fill="#08191d" fill-opacity=".87" stroke="#69C973" stroke-width="11"/>
  <circle r="187" fill="none" stroke="#90bcb4" stroke-opacity=".4" stroke-width="3"/>
  <g stroke="#cee4cf" stroke-width="6" stroke-linecap="round" opacity=".88">
   <path d="M0-171V-147M171 0H147M0 171V147M-171 0H-147"/>
  </g>
  <path d="M0 0L91-98M0 0L-2-127" stroke="#107c10" stroke-width="16" stroke-linecap="round"/>
  <circle r="21" fill="#107c10"/>
  <path d="M-99 85H108" stroke="#107c10" stroke-opacity=".42" stroke-width="2"/>
  <text x="0" y="135" font-family="sans-serif" font-size="49" text-anchor="middle" font-weight="800" fill="#8EDD96">02:03</text>
 </g>
 <g fill="#d4f3d5">
  <circle cx="1080" cy="220" r="5"/><circle cx="1780" cy="260" r="8"/><circle cx="870" cy="280" r="6"/><circle cx="1760" cy="120" r="4"/>
 </g>
`,'#9adac6');

const burst=common('burst',`
 <!-- Recognizable achievement-unlocked cards scattering out of a kinetic burst. -->
 <g stroke="#43AE4A" stroke-width="5" stroke-linecap="round" opacity=".62">
  <path d="M730 837L1578 270M809 1012L1780 582M1148 1040L1702 190M1020 160L1840 690" />
 </g>
 <circle cx="1385" cy="528" r="360" fill="#107c10" opacity=".1" filter="url(#glow)"/>
 <g transform="translate(1175 280) rotate(-20)">
  <rect width="430" height="245" rx="32" fill="url(#glass)" stroke="#45AA54" stroke-width="9"/>
  <circle cx="103" cy="121" r="65" fill="#315f3b" stroke="#107c10" stroke-width="7"/>
  <path d="M72 118L96 141 138 96" stroke="#8DDE94" stroke-width="14" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
  <path d="M210 91H367M210 127H339M210 163H295" stroke="#b9eeb0" stroke-width="15" stroke-linecap="round" opacity=".67"/>
 </g>
 <g transform="translate(917 575) rotate(12)">
  <rect width="545" height="330" rx="35" fill="#061b1b" stroke="#50B458" stroke-width="12"/>
  <rect x="19" y="19" width="505" height="290" rx="21" fill="url(#glass)" stroke="#4DAE58" stroke-opacity=".45" stroke-width="3"/>
  <rect x="64" y="69" width="171" height="171" rx="26" fill="#3b6438" stroke="#63C16B" stroke-width="6"/>
  <path d="M110 148L144 180 199 120" fill="none" stroke="#A4EAAA" stroke-width="25" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="276" y="122" font-family="sans-serif" font-size="39" font-weight="800" fill="#e6ffc3">ACHIEVEMENT</text>
  <text x="276" y="170" font-family="sans-serif" font-size="36" font-weight="800" fill="#107c10">UNLOCKED</text>
  <path d="M276 205H464" stroke="#b7e1c2" stroke-opacity=".5" stroke-width="8" stroke-linecap="round"/>
 </g>
 <g transform="translate(1585 620) rotate(19)">
  <rect width="290" height="188" rx="24" fill="#17382c" stroke="#55B95D" stroke-width="7"/>
  <circle cx="76" cy="95" r="45" fill="#375e32" stroke="#8DDD95" stroke-width="5"/>
  <path d="M56 91L70 109 99 71" stroke="#edffbe" stroke-width="12" fill="none" stroke-linecap="round"/>
  <path d="M149 81H247M149 113H225" stroke="#b2edb3" stroke-width="9" stroke-linecap="round"/>
 </g>
 <g fill="#92E09B">
  <path d="M1010 256l11 40 39 11-39 12-11 41-11-41-40-12 40-11z"/>
  <path d="M1780 426l7 27 27 7-27 7-7 26-7-26-27-7 27-7z"/>
  <path d="M1002 977l7 27 27 7-27 7-7 26-7-26-27-7 27-7z"/>
 </g>
`);

const rare=common('rare',`
 <!-- Faceted, precious gemstone displayed as a physical collectible under spotlights. -->
 <path d="M1100-80L1390 785H1710L1770-80Z" fill="url(#spot)" opacity=".42"/>
 <path d="M1550-80L1260 785H1410L1820-80Z" fill="url(#spot)" opacity=".28"/>
 <ellipse cx="1450" cy="760" rx="430" ry="98" fill="#57B860" opacity=".13" filter="url(#glow)"/>
 <g transform="translate(1020 120)">
  <path d="M209 265L405 64H754L944 265 576 648Z" fill="#5DBB65" stroke="#eefdb9" stroke-width="12" stroke-linejoin="round"/>
  <path d="M209 265L405 64 483 265Z" fill="#538e60"/>
  <path d="M405 64H754L677 265H483Z" fill="#e4ffac"/>
  <path d="M754 64L944 265H677Z" fill="#8ace93"/>
  <path d="M209 265L483 265 576 648Z" fill="#498d81"/>
  <path d="M483 265L677 265 576 648Z" fill="#6AC572"/>
  <path d="M677 265L944 265 576 648Z" fill="#2c9a83"/>
  <path d="M483 265L405 64 754 64 677 265Z" fill="none" stroke="#fbffd5" stroke-width="9" opacity=".8"/>
  <path d="M209 265H944L576 648Z" fill="none" stroke="#dcffb1" stroke-width="8" opacity=".45"/>
  <path d="M209 265L405 64H754L944 265 576 648Z" fill="none" stroke="#e4ffb3" stroke-width="13" stroke-linejoin="round"/>
  <path d="M480 83L630 83" stroke="#ffffff" stroke-width="11" stroke-linecap="round" opacity=".65"/>
 </g>
 <path d="M1020 895L1110 790H1820L1920 895 1750 1015H1170Z" fill="#182f28" stroke="#72974d" stroke-width="9"/>
 <path d="M1110 790H1820L1730 860H1180Z" fill="#2b4230" stroke="#bdcf7d" stroke-width="5"/>
 <path d="M1175 938H1764" stroke="url(#gold)" stroke-width="13" stroke-linecap="round"/>
 <path d="M1480 28l14 45 46 14-46 14-14 46-14-46-45-14 45-14z" fill="#fff7d5"/>
 <path d="M1824 332l11 39 40 11-40 11-11 39-11-39-39-11 39-11z" fill="#fff6b0"/>
 <path d="M1036 482l10 34 33 9-33 10-10 34-9-34-34-10 34-9z" fill="#fff6b0"/>
`,'#d6c875');

const full=common('full',`
 <!-- Victory arch, finish line and a physically legible 100% completion medal. -->
 <path d="M800 945L1070 755H1800L1920 945Z" fill="#12372b" stroke="#368E43" stroke-width="7"/>
 <path d="M970 985L1260 785M1210 1040L1410 790M1570 1040L1550 790" stroke="#6AC773" stroke-width="7" opacity=".5"/>
 <path d="M1100 840V265Q1440-175 1780 265V840" fill="none" stroke="#273f37" stroke-width="108" stroke-linejoin="round"/>
 <path d="M1100 840V265Q1440-175 1780 265V840" fill="none" stroke="#4BAE53" stroke-width="18" stroke-linejoin="round"/>
 <path d="M1110 820V265Q1440-160 1770 265V820" fill="none" stroke="#93e4ac" stroke-opacity=".65" stroke-width="6"/>
 <g transform="translate(1440 458)">
  <circle r="262" fill="#081c19" stroke="#55A960" stroke-width="24"/>
  <circle r="236" fill="none" stroke="#ddff94" stroke-width="8" stroke-dasharray="1250 230" transform="rotate(-90)"/>
  <path d="M-112 0L-32 80 135-96" fill="none" stroke="url(#neon)" stroke-width="35" stroke-linecap="round" stroke-linejoin="round"/>
  <text x="0" y="171" font-family="sans-serif" font-size="88" font-weight="900" text-anchor="middle" fill="#e6ffb5">100%</text>
 </g>
 <path d="M971 762L1870 762" stroke="#d5ff8e" stroke-width="15"/>
 <rect x="970" y="776" width="905" height="100" fill="url(#checker)" opacity=".85"/>
 <path d="M970 895L1875 895" stroke="#4D9D58" stroke-width="9"/>
 <path d="M825 323l10 40 40 10-40 10-10 40-10-40-40-10 40-10zM1790 170l12 47 47 12-47 12-12 47-12-47-47-12 47-12z" fill="#e8ffad"/>
`);
const art={night,burst,rare,full};
await mkdir(outDir,{recursive:true});
for(const [name,svg] of Object.entries(art)){
 const output=new URL(`../src/assets/journey/${name}.webp`,import.meta.url);
 await sharp(Buffer.from(svg)).resize(1920,1080).webp({quality:90,effort:5}).toFile(fileURLToPath(output));
 console.log(`Generated journey ${name} background: 1920x1080`);
}
