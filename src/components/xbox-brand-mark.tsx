import {XBOX_SPHERE_PATH} from '../xbox-brand-path';

/** Static Xbox sphere mark (Simple Icons / CC0). Kept inline in the JS bundle,
 * so Mythic cards paint it immediately with zero image requests or decode delay. */
export function XboxBrandMark(){
 return <svg className="mythic-xbox-mark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"
  aria-hidden="true" focusable="false">
  <path d={XBOX_SPHERE_PATH}/>
 </svg>;
}
