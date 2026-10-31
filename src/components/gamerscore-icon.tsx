/** Xbox Gamerscore emblem: a crisp, scalable white disc with dark G, matching the native badge. */
export function GamerscoreIcon({size=16}:{size?:number}){
 return <svg className="gamerscore-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
  <circle cx="12" cy="12" r="12" fill="#fff"/>
  <path fill="#191919" d="M18.7 10.7H12.1v3.1h3.05c-.45 1.58-1.83 2.5-3.63 2.5-2.68 0-4.3-1.87-4.3-4.3 0-2.48 1.68-4.33 4.2-4.33 1.76 0 2.9.79 3.63 1.95l3.07-1.56c-1.29-2.62-3.66-4.12-6.7-4.12-4.47 0-7.63 3.34-7.63 8.05 0 4.58 3.07 8.05 7.73 8.05 4.43 0 7.46-3.19 7.46-7.84v-1.51Z"/>
 </svg>;
}
