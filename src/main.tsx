import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from './dashboard';
import {unlock,lock,workflow} from './vault';
import {rememberDevice,recalledPassword,forgetDevice} from './device';
import './style.css';
function App(){const [remember,setRemember]=useState(true),[storageNotice,setStorageNotice]=useState('');const [ready,setReady]=useState(false),[initialized,setInitialized]=useState(false),[logged,setLogged]=useState(false),[envelope,setEnvelope]=useState<unknown>(),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
useEffect(()=>{(async()=>{try{if(import.meta.env.DEV&&new URLSearchParams(location.search).get('demo')==='1'){const {demoRecords}=await import('./demo');const {loadDesignPreview}=await import('./vault');loadDesignPreview(demoRecords());setLogged(true);return;}const base=import.meta.env.BASE_URL;const r=await fetch(base+'status.json',{cache:'no-store'});if(!r.ok)throw Error('无法读取发布状态，请刷新重试。');const s=await r.json();if(s.initialized){const v=await fetch(base+'vault.json',{cache:'no-store'});if(!v.ok)throw Error('加密数据文件读取失败。');const data=await v.json();setEnvelope(data);setInitialized(true);const saved=await recalledPassword();if(saved){try{await unlock(saved,data);setLogged(true)}catch{lock();await forgetDevice().catch(()=>{});setError('记住的密码已失效，请重新输入当前密码。')}}}}catch(e){setError((e as Error).message)}finally{setReady(true)}})();},[]);
if(!ready)return <div className="overlay entry-screen"><p>正在打开游戏档案…</p></div>;
if(logged)return <>{import.meta.env.DEV&&new URLSearchParams(location.search).get('demo')==='1'&&<div className="demo-banner">本地设计预览 · 示例数据，非真实游玩记录</div>}{storageNotice&&<p role="status" className="storage-notice">{storageNotice}</p>}<Dashboard locking={busy} onLock={async()=>{setBusy(true);try{await forgetDevice()}catch{setError('浏览器未能清除记住状态，请清除此网站的浏览器数据。')}finally{lock();setLogged(false);setPassword('');setBusy(false)}}}/></>;
return <div className="overlay entry-screen"><section className="dialog"><span className="eyebrow">XBOX PLAYLOG</span><h2>{initialized?'欢迎回到 XBOX Playlog':'XBOX Playlog 正在等待首次同步'}</h2>{initialized?<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');setStorageNotice('');try{await unlock(password,envelope);try{if(remember)await rememberDevice(password);else await forgetDevice()}catch{setStorageNotice('已解锁，但当前浏览器无法记住设备。')}setPassword('');setLogged(true)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}><p>游戏记录已加密。输入应用密码，在本机解密查看。</p><label className="field">应用访问密码<input autoFocus type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><label style={{display:'flex',alignItems:'center',gap:8,marginTop:16,fontSize:12}}><input type="checkbox" checked={remember} onChange={e=>setRemember(e.target.checked)}/>在此设备记住我（30天）</label><button className="primary full" disabled={busy}>{busy?'正在解密…':'解锁我的游戏档案'}</button><p className="note">记住后可自动解锁，限当前浏览器使用；公共设备请取消勾选。点击“锁定档案”可清除记住状态。</p></form>:<><p>计划每半小时从 微软 Xbox 记录同步，在每小时 00、30 分触发，实际运行可能因排队延迟。若微软授权失效，记录不会更新；可在下方查看任务结果。首次同步成功后，刷新此页并输入 APP_PASSWORD 查看。</p><p className="note">游戏记录会先用 APP_PASSWORD 加密，再发布到 GitHub Pages。首次同步完成前，这里不会出现密码输入框。</p><a className="secondary full" href={workflow} target="_blank" rel="noreferrer">查看同步运行记录 ↗</a><p className="note">微软授权已加密保存并自动续期；APP_PASSWORD 用于解锁档案。</p></>}{error&&<p className="inline-error" role="alert">{error}</p>}</section></div>;
}
const root=import.meta.hot?.data.root??createRoot(document.getElementById('root')!);
if(import.meta.hot)import.meta.hot.data.root=root;
root.render(<App/>);
// Cache only the public app shell and artwork; vault.json/status.json always use network.
if(import.meta.env.PROD&&'serviceWorker' in navigator){
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register(import.meta.env.BASE_URL+'sw.js',{scope:import.meta.env.BASE_URL}).catch(()=>{});
 });
}
