import {useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import Dashboard from './dashboard';
import {unlock,lock,repo,workflow} from './vault';
import './style.css';
function App(){const [ready,setReady]=useState(false),[initialized,setInitialized]=useState(false),[logged,setLogged]=useState(false),[envelope,setEnvelope]=useState<unknown>(),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
useEffect(()=>{(async()=>{try{const base=import.meta.env.BASE_URL;const r=await fetch(base+'status.json',{cache:'no-store'});if(!r.ok)throw Error('无法读取发布状态，请刷新重试。');const s=await r.json();if(s.initialized){const v=await fetch(base+'vault.json',{cache:'no-store'});if(!v.ok)throw Error('加密数据文件读取失败。');setEnvelope(await v.json());setInitialized(true);}}catch(e){setError((e as Error).message)}finally{setReady(true)}})();},[]);
if(!ready)return <div className="overlay entry-screen"><p>正在打开游戏档案…</p></div>;
if(logged)return <><Dashboard/><button className="signout" onClick={()=>{lock();setLogged(false);setPassword('')}}>锁定档案</button></>;
return <div className="overlay entry-screen"><section className="dialog"><span className="eyebrow">PLAYLOG / GITHUB PAGES</span><h2>{initialized?'欢迎回到游迹':'游迹正在等待首次同步'}</h2>{initialized?<form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await unlock(password,envelope);setPassword('');setLogged(true)}catch(e){setError((e as Error).message)}finally{setBusy(false)}}}><p>游戏记录已加密。输入应用密码，在本机解密查看。</p><label className="field">应用访问密码<input autoFocus type="password" autoComplete="current-password" required value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="primary full" disabled={busy}>{busy?'正在解密…':'解锁我的游戏档案'}</button><p className="note">密码只用于本机解密，不会发送到网站服务器。更换设备也可使用同一密码打开已发布的档案。</p></form>:<><p>计划每天从 Exophase 公开档案同步，预计北京时间上午 8:17 左右运行。若 Exophase 拒绝云端任务请求，记录不会更新；可在下方查看任务结果。首次同步成功后，刷新此页并输入 APP_PASSWORD 查看。</p><p className="note">游戏记录会先用 APP_PASSWORD 加密，再发布到 GitHub Pages。首次同步完成前，这里不会出现密码输入框。</p><a className="secondary full" href={workflow} target="_blank" rel="noreferrer">查看同步运行记录 ↗</a><p className="note">无需 Xbox/Microsoft 应用或登录令牌；仓库只需保留 APP_PASSWORD。</p></>}{error&&<p className="inline-error" role="alert">{error}</p>}</section></div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
