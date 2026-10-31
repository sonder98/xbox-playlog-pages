/** A transparent, stroke-based G mark with the same weight and 24px grid as Lucide icons. */
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
  <path d="M18 7.6C16.6 5.9 14.5 5 12 5C7.8 5 4.5 8.2 4.5 12S7.8 19 12 19C16.2 19 19.5 16.2 19.5 12.5V12H12.5"/>
 </svg>;
}
