import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from './dashboard';
import {unlock,lock,workflow,cloudVaultUrl} from './vault';
import {readEncryptedHistory} from './encrypted-history';
import {rememberDevice,recalledPassword,forgetDevice} from './device';
import './style.css';

// Initial cloud downloads can be large on mobile data; cached startups never wait for them.
const FETCH_TIMEOUT_MS=30_000;

/** A missing snapshot means "first sync" only when the published status explicitly says so.
 * The status endpoint must never block an otherwise available encrypted vault. */
async function publishedVault():Promise<unknown|null>{
 const controller=new AbortController();
 const timer=window.setTimeout(()=>controller.abort(),FETCH_TIMEOUT_MS);
 try{
  const response=await fetch(cloudVaultUrl(),{cache:'no-store',signal:controller.signal});
  if(response.status===404){
   try{
    const status=await fetch(import.meta.env.BASE_URL+'status.json',{cache:'no-store',signal:controller.signal});
    if(status.ok&&(await status.json()).initialized===false)return null;
   }catch{/* Network errors are not evidence of a first sync. */}
  }
  if(!response.ok)throw Error('加密数据文件暂时无法访问（HTTP '+response.status+'）。');
  return await response.json();
 }finally{window.clearTimeout(timer);}
}

function loadingMessage(error:unknown):string{
 const e=error as Error;
 if(e?.name==='AbortError'||/Load failed|Failed to fetch|NetworkError|network request failed/i.test(e?.message||'')){
  return '连接游戏档案失败，可能是网络不稳定或请求超时。之前同步的云端记录并未被删除。';
 }
 return e?.message||'游戏档案读取失败，请检查网络后重试。';
}

function App(){
 const [remember,setRemember]=useState(true);
 const [storageNotice,setStorageNotice]=useState('');
 const [ready,setReady]=useState(false);
 const [initialized,setInitialized]=useState(false);
 const [waitingFirstSync,setWaitingFirstSync]=useState(false);
 const [fromCache,setFromCache]=useState(false);
 const [logged,setLogged]=useState(false);
 const [envelope,setEnvelope]=useState<unknown>();
 const [password,setPassword]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [retry,setRetry]=useState(0);

 useEffect(()=>{
  let cancelled=false;
  (async()=>{
   setReady(false);
   setError('');
   setWaitingFirstSync(false);
   try{
    if(import.meta.env.DEV&&new URLSearchParams(location.search).get('demo')==='1'){
     const {demoRecords}=await import('./demo');
     const {loadDesignPreview}=await import('./vault');
     loadDesignPreview(demoRecords());
     if(!cancelled)setLogged(true);
     return;
    }
    // A previously decrypted, AES-GCM encrypted snapshot opens without a network round trip.
    const cached=await readEncryptedHistory();
    const useCache=!!cached;
    const data=cached||await publishedVault();
    if(cancelled)return;
    if(data===null){setWaitingFirstSync(true);return;}
    setInitialized(true);
    setEnvelope(data);
    setFromCache(useCache);
    const saved=await recalledPassword();
    if(cancelled)return;
    if(saved){
     try{
      await unlock(saved,data,{fromCache:useCache});
      if(!cancelled)setLogged(true);
     }catch{
      lock();
      await forgetDevice().catch(()=>{});
      if(!cancelled)setError('记住的密码已失效，请重新输入当前密码。');
     }
    }
   }catch(e){
    if(!cancelled)setError(loadingMessage(e));
   }finally{
    if(!cancelled)setReady(true);
   }
  })();
  return()=>{cancelled=true;};
 },[retry]);

 if(!ready)return <div className="overlay entry-screen"><p>正在打开游戏档案…</p></div>;

 if(logged)return <>
  {import.meta.env.DEV&&new URLSearchParams(location.search).get('demo')==='1'&&<div className="demo-banner">本地设计预览 · 示例数据，非真实游玩记录</div>}
  {storageNotice&&<p role="status" className="storage-notice">{storageNotice}</p>}
  <Dashboard refreshFromCache={fromCache} locking={busy} onLock={async()=>{
   setBusy(true);
   try{await forgetDevice();}
   catch{setError('浏览器未能清除记住状态，请清除此网站的浏览器数据。');}
   finally{lock();setLogged(false);setPassword('');setBusy(false);}
  }}/>
 </>;

 return <div className="overlay entry-screen"><section className="dialog">
  <span className="eyebrow">XBOX PLAYLOG</span>
  <h2>{initialized?'欢迎回到 XBOX Playlog':waitingFirstSync?'XBOX Playlog 正在等待首次同步':'暂时无法连接游戏档案'}</h2>
  {initialized?
   <form onSubmit={async e=>{
    e.preventDefault();
    setBusy(true);setError('');setStorageNotice('');
    try{
     await unlock(password,envelope,{fromCache});
     try{if(remember)await rememberDevice(password);else await forgetDevice();}
     catch{setStorageNotice('已解锁，但当前浏览器无法记住设备。');}
     setPassword('');setLogged(true);
    }catch(e){setError((e as Error).message);}
    finally{setBusy(false);}
   }}>
    <p>游戏记录已加密。输入应用密码，在本机解密查看。</p>
    {fromCache&&<p className="note">已找到本机保存的加密历史记录。解锁后会在后台检查云端更新。</p>}
    <label className="field">应用访问密码<input autoFocus type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label>
    <label style={{display:'flex',alignItems:'center',gap:8,marginTop:16,fontSize:12}}>
     <input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>在此设备记住我（30天）
    </label>
    <button className="primary full" disabled={busy}>{busy?'正在解密…':'解锁我的游戏档案'}</button>
    <p className="note">记住后可自动解锁，限当前浏览器使用；公共设备请取消勾选。点击“锁定档案”可清除记住状态。</p>
   </form>:
   waitingFirstSync?<><p>计划每两小时从微软 Xbox 记录同步，另有每日跨天时长结算采样，实际运行可能因排队延迟。若微软授权失效，记录不会更新；可在下方查看任务结果。首次同步成功后，刷新此页并输入 APP_PASSWORD 查看。</p>
    <p className="note">游戏记录会先用 APP_PASSWORD 加密，再发布到云端存储。首次同步完成前，这里不会出现密码输入框。</p>
    <a className="secondary full" href={workflow} target="_blank" rel="noreferrer">查看同步运行记录 ↗</a>
    <p className="note">微软授权已加密保存并自动续期；APP_PASSWORD 用于解锁档案。</p></>:
   <><p>这次未能从网络读取加密档案，当前设备也没有已保存的历史快照。已有 Xbox 记录不会因为网络故障而丢失。</p>
    <button type="button" className="secondary full" onClick={()=>setRetry(n=>n+1)}>重新读取游戏档案</button>
    <a className="external" href={workflow} target="_blank" rel="noreferrer">查看同步运行记录 ↗</a></>}
  {error&&<p className="inline-error" role="alert">{error}</p>}
 </section></div>;
}

const root=import.meta.hot?.data.root??createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<App/>);
// The service worker caches the shell and artwork; validated encrypted history is saved separately in IndexedDB.
if(import.meta.env.PROD&&'serviceWorker' in navigator){
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js',{scope:import.meta.env.BASE_URL}).catch(()=>{});
 });
}
