/** User-selected color scheme. Kept independent of encrypted Xbox data. */
export type PlaylogTheme='dark'|'light';
export const THEME_STORAGE_KEY='xbox-playlog-theme';
export const THEME_BAR_COLORS={dark:'#0F0F0F',light:'#F4F6F3'} as const;

export function normalizeThemePreference(value:unknown):PlaylogTheme {
  return value==='light'?'light':'dark';
}
export function readThemePreference(storage?:Pick<Storage,'getItem'>):PlaylogTheme {
  try{return normalizeThemePreference((storage??localStorage).getItem(THEME_STORAGE_KEY));}
  catch{return 'dark';}
}
export function saveThemePreference(theme:PlaylogTheme,storage?:Pick<Storage,'setItem'>):void {
  try{(storage??localStorage).setItem(THEME_STORAGE_KEY,theme);}
  catch{/* Private browsing / quota failure must not block the visual switch. */}
}
export function applyTheme(theme:PlaylogTheme,doc:Document=document):void {
  doc.documentElement.dataset.theme=theme;
  doc.querySelector('meta[name="theme-color"]')?.setAttribute('content',THEME_BAR_COLORS[theme]);
  doc.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute('content',theme==='light'?'default':'black-translucent');
}
