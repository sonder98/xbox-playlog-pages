/** Transparent Xbox Gamerscore badge: complete circular outline and a balanced upright G. */
export function GamerscoreIcon({size=16}:{size?:number}){
 return <svg
  className="gamerscore-icon"
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  strokeWidth={2}
  strokeLinecap="round"
  strokeLinejoin="round"
  aria-hidden="true"
  focusable="false"
 >
  <circle cx="12" cy="12" r="10"/>
  <path d="M15.45 9.05C14.7 8.05 13.75 7.55 12.5 7.55C9.95 7.55 8.2 9.52 8.2 12C8.2 14.48 9.95 16.45 12.5 16.45C14.65 16.45 15.85 15.02 15.85 12.8V12H12.45" strokeWidth={1.9}/>
 </svg>;
}
